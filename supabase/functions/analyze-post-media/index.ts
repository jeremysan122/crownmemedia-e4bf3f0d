// Post-publish AI media analysis pipeline.
//
// Called fire-and-forget from the client after `publish_post_idempotent`
// succeeds. Runs Gemini 2.5 Flash with vision on every image URL attached to
// the post, asks for a single strict JSON verdict covering safety classes,
// OCR text, and master-category suggestion, then:
//   1. upserts a row in `post_media_ai_analysis` (one per post; unique
//      constraint prevents duplicate work).
//   2. flips `posts.is_sensitive` / `posts.is_removed` /
//      `posts.moderation_status` / `posts.sensitive_reason` based on the
//      verdict, but never overwrites the user's selected category.
//
// Fail closed: posts remain processing/pending_review until analysis explicitly
// approves safe or allowed-sensitive media.
//
// Idempotent: a second call for the same post short-circuits when a
// `complete` row already exists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronRequest } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-crownme-cron-secret, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// CrownMe master categories. Kept in sync with main_categories.slug.
const MASTER_CATEGORIES = [
  "royal-crowns",
  "fashion-beauty",
  "fitness-sports",
  "relationships-social",
  "pets-animals",
  "travel-outdoors",
  "cars-auto",
  "food-cooking",
  "home-living",
  "gaming-tech",
  "business-hustle",
  "creative-talent",
  "internet-entertainment",
  "seasonal-events",
  "high-engagement",
] as const;

const MODEL = "google/gemini-2.5-flash";

const SYSTEM = `You analyse uploaded social-media images for CrownMe.
Return EXACTLY one JSON object — no prose, no markdown — matching this schema:
{
  "safety_status": "safe" | "sensitive" | "blocked" | "needs_review",
  "confidence": number (0..1),
  "reason": string (<=160 chars, human-readable),
  "safety_flags": {
    "nudity": boolean, "sexual": boolean, "violence_gore": boolean,
    "weapons": boolean, "drugs": boolean, "hate_or_extremist": boolean,
    "harassment": boolean, "scam_or_spam": boolean,
    "minors_or_underage": boolean, "low_quality": boolean
  },
  "detected_objects": string[] (<=20 short tags),
  "suggested_master_category": one of ${JSON.stringify(MASTER_CATEGORIES)} | null,
  "suggested_topic": string | null,
  "extracted_text": string (concat of OCR text across all images; "" if none),
  "detected_language": ISO 639-1 lowercase like "en" | null,
  "text_flags": {
    "profanity": boolean, "threats": boolean,
    "scam_or_phishing": boolean, "spam_links": boolean,
    "payment_solicitation": boolean
  }
}

Rules:
- safety_status="blocked" ONLY for clear nudity, sexual content involving anyone,
  graphic violence/gore, hate symbols, illegal acts, or any subject who appears
  to be a minor in sexual/suggestive context.
- safety_status="sensitive" for swimwear+suggestive pose, partial nudity,
  shocking but non-graphic violence, drug paraphernalia, mild gore (medical),
  or strong language overlays — content adults may still want to see with blur.
- safety_status="needs_review" when you cannot confidently classify (low light,
  obscured subject, ambiguous symbol). Set confidence accordingly.
- safety_status="safe" only when ALL images are clearly appropriate.
- Treat extracted text as part of the safety signal (scam contact info, threats,
  phishing links should raise safety_status to at least "needs_review").`;

interface AiVerdict {
  safety_status: "safe" | "sensitive" | "blocked" | "needs_review";
  confidence: number;
  reason: string;
  safety_flags: Record<string, boolean>;
  detected_objects: string[];
  suggested_master_category: string | null;
  suggested_topic: string | null;
  extracted_text: string;
  detected_language: string | null;
  text_flags: Record<string, boolean>;
}

function coerceVerdict(raw: unknown): AiVerdict {
  const v = (raw ?? {}) as Record<string, unknown>;
  const allowedStatus = ["safe", "sensitive", "blocked", "needs_review"] as const;
  const status = (typeof v.safety_status === "string" && (allowedStatus as readonly string[]).includes(v.safety_status))
    ? v.safety_status as AiVerdict["safety_status"]
    : "needs_review";
  const cat = typeof v.suggested_master_category === "string"
    && (MASTER_CATEGORIES as readonly string[]).includes(v.suggested_master_category)
    ? v.suggested_master_category : null;
  return {
    safety_status: status,
    confidence: typeof v.confidence === "number" ? Math.max(0, Math.min(1, v.confidence)) : 0.5,
    reason: typeof v.reason === "string" ? v.reason.slice(0, 200) : "",
    safety_flags: (v.safety_flags && typeof v.safety_flags === "object") ? v.safety_flags as Record<string, boolean> : {},
    detected_objects: Array.isArray(v.detected_objects)
      ? v.detected_objects.filter((x): x is string => typeof x === "string").slice(0, 20)
      : [],
    suggested_master_category: cat,
    suggested_topic: typeof v.suggested_topic === "string" ? v.suggested_topic.slice(0, 80) : null,
    extracted_text: typeof v.extracted_text === "string" ? v.extracted_text.slice(0, 4000) : "",
    detected_language: typeof v.detected_language === "string" ? v.detected_language.slice(0, 8) : null,
    text_flags: (v.text_flags && typeof v.text_flags === "object") ? v.text_flags as Record<string, boolean> : {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let postId: string | null = null;
  const startedAt = Date.now();

  try {
    // ─── Authentication: user JWT or the internal moderation queue worker ───
    let callerId: string | null = null;
    const internalRequest = req.headers.has("x-crownme-cron-secret");
    if (internalRequest) {
      const authorization = authorizeCronRequest(req);
      if (!authorization.ok) {
        return new Response(JSON.stringify({ error: authorization.error }), {
          status: authorization.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = claimsData.claims.sub as string;
    }

    const body = await req.json().catch(() => ({}));
    postId = typeof body?.post_id === "string" ? body.post_id : null;
    if (!postId) {
      return new Response(JSON.stringify({ error: "post_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Idempotency guard ───
    const { data: existing, error: existingError } = await admin
      .from("post_media_ai_analysis")
      .select("id, analysis_status, retry_count")
      .eq("post_id", postId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.analysis_status === "complete") {
      const { error: completeError } = await admin.rpc("complete_post_media_analysis_job", { _post_id: postId });
      if (completeError) throw completeError;
      return new Response(JSON.stringify({ ok: true, status: "already_complete" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Load post media ───
    const { data: post, error: postErr } = await admin
      .from("posts")
      .select("id, user_id, image_url, image_urls, media_type, is_removed")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post) {
      return new Response(JSON.stringify({ error: "post not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Authorize: only the post owner or an admin/moderator may trigger analysis.
    if (callerId && post.user_id !== callerId) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
      const { data: isMod } = await admin.rpc("has_role", { _user_id: callerId, _role: "moderator" });
      if (!isAdmin && !isMod) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (post.is_removed) {
      const { error: completeError } = await admin.rpc("complete_post_media_analysis_job", { _post_id: postId });
      if (completeError) throw completeError;
      return new Response(JSON.stringify({ ok: true, status: "post_removed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const urls: string[] = Array.isArray(post.image_urls) && post.image_urls.length > 0
      ? post.image_urls.filter((u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 6)
      : (typeof post.image_url === "string" ? [post.image_url] : []);

    // Reserve a pending row (idempotent upsert) so concurrent invocations collide.
    await admin.from("post_media_ai_analysis").upsert({
      post_id: postId,
      user_id: post.user_id,
      media_urls: urls,
      model_name: MODEL,
      analysis_status: "pending",
      retry_count: (existing?.retry_count ?? 0) + (existing ? 1 : 0),
    }, { onConflict: "post_id" }).throwOnError();

    if (urls.length === 0) {
      // Missing preview media is never enough evidence to approve a post.
      await admin.from("post_media_ai_analysis").update({
        analysis_status: "needs_review",
        safety_status: "needs_review",
        moderation_reason: "no reviewable preview media",
        duration_ms: Date.now() - startedAt,
      }).eq("post_id", postId).throwOnError();
      await admin.from("posts").update({
        moderation_status: "pending_review",
        publish_status: "pending_review",
      }).eq("id", postId).throwOnError();
      return new Response(JSON.stringify({ ok: false, status: "no_media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Call Gemini via Lovable AI Gateway ───
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await admin.from("post_media_ai_analysis").update({
        analysis_status: "failed",
        error_message: "LOVABLE_API_KEY missing",
        duration_ms: Date.now() - startedAt,
      }).eq("post_id", postId).throwOnError();
      await admin.from("posts").update({
        moderation_status: "pending_review",
        publish_status: "pending_review",
      }).eq("id", postId).throwOnError();
      return new Response(JSON.stringify({ ok: false, error: "AI disabled" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" },
      });
    }

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: "Analyse every image. Respond with one JSON object only." },
      ...urls.map((u) => ({ type: "image_url", image_url: { url: u } })),
    ];

    const aiStarted = Date.now();
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      const isRate = aiRes.status === 429;
      const isCredits = aiRes.status === 402;
      await admin.from("post_media_ai_analysis").update({
        analysis_status: "needs_review",
        safety_status: "needs_review",
        moderation_reason: isCredits ? "ai credits exhausted" : isRate ? "ai rate limited" : "ai gateway error",
        error_message: text.slice(0, 500),
        duration_ms: Date.now() - startedAt,
      }).eq("post_id", postId).throwOnError();
      // Per moderation rules: hide from public surfaces until reviewed.
      await admin.from("posts").update({
        moderation_status: "pending_review",
        publish_status: "pending_review",
      }).eq("id", postId).throwOnError();
      return new Response(JSON.stringify({ ok: false, status: aiRes.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const verdict = coerceVerdict(parsed);
    const aiDuration = Date.now() - aiStarted;
    const usage = aiJson?.usage ?? null;

    // ─── Decide post-level flags (additive — never relax user's own settings) ───
    const postUpdate: Record<string, unknown> = {};
    if (verdict.safety_status === "blocked") {
      // Auto-hide + route to admin review. Keep is_removed=false so admins can
      // see it in CommandCenterContent; only humans should hard-remove.
      postUpdate.moderation_status = "pending_review";
      postUpdate.publish_status = "pending_review";
      postUpdate.is_sensitive = true;
      postUpdate.sensitive_reason = verdict.reason.slice(0, 120) || "Flagged by automated review";
      postUpdate.content_rating = "explicit";
    } else if (verdict.safety_status === "sensitive") {
      postUpdate.is_sensitive = true;
      postUpdate.sensitive_reason = verdict.reason.slice(0, 120) || "Marked sensitive by automated review";
      postUpdate.content_rating = "suggestive";
      postUpdate.moderation_status = "approved";
      postUpdate.publish_status = "approved";
    } else if (verdict.safety_status === "needs_review") {
      postUpdate.moderation_status = "pending_review";
      postUpdate.publish_status = "pending_review";
    } else {
      postUpdate.moderation_status = "approved";
      postUpdate.publish_status = "approved";
    }

    // Always populate the AI search/discovery fields on the post — search
    // recall is a non-safety benefit that runs regardless of the verdict.
    const searchableParts = [verdict.extracted_text, verdict.suggested_topic]
      .filter((s): s is string => !!s && s.length > 0);
    if (searchableParts.length > 0) {
      postUpdate.ai_searchable_text = searchableParts.join(" ").toLowerCase().slice(0, 4000);
    }
    // Only surface the AI category suggestion when we're confident enough to
    // trust it for recall fallbacks. Never overrides the user's own choice.
    if (verdict.suggested_master_category && verdict.confidence >= 0.7) {
      postUpdate.ai_suggested_main_category_slug = verdict.suggested_master_category;
    }

    if (Object.keys(postUpdate).length > 0) {
      await admin.from("posts").update(postUpdate).eq("id", postId).throwOnError();
    }

    // ─── Enqueue for human review when not safe ───
    if (verdict.safety_status === "blocked" || verdict.safety_status === "needs_review") {
      const { data: queued, error: queueReadError } = await admin.from("moderation_queue")
        .select("id")
        .eq("target_type", "post")
        .eq("target_id", postId)
        .in("status", ["pending", "in_review"])
        .limit(1)
        .maybeSingle();
      if (queueReadError) throw queueReadError;
      if (!queued) {
        await admin.from("moderation_queue").insert({
          target_type: "post",
          target_id: postId,
          reason: `ai:${verdict.safety_status}:${verdict.reason || "auto"}`.slice(0, 200),
          priority: verdict.safety_status === "blocked" ? "urgent" : "normal",
          status: "pending",
          metadata: { ai: true, model: MODEL, confidence: verdict.confidence, flags: verdict.safety_flags },
        }).throwOnError();
      }
    }

    await admin.from("post_media_ai_analysis").update({
      analysis_status: "complete",
      safety_status: verdict.safety_status,
      confidence_score: verdict.confidence,
      suggested_master_category: verdict.suggested_master_category,
      suggested_topic: verdict.suggested_topic,
      detected_objects: verdict.detected_objects,
      safety_flags: verdict.safety_flags,
      extracted_text: verdict.extracted_text,
      detected_language: verdict.detected_language,
      text_flags: verdict.text_flags,
      moderation_reason: verdict.reason,
      raw_ai_response: aiJson,
      duration_ms: aiDuration,
      token_usage: usage,
      error_message: null,
    }).eq("post_id", postId).throwOnError();

    const { error: completeError } = await admin.rpc("complete_post_media_analysis_job", { _post_id: postId });
    if (completeError) throw completeError;

    return new Response(JSON.stringify({ ok: true, verdict }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-post-media error", e);
    if (postId) {
      try {
        await admin.from("post_media_ai_analysis").upsert({
          post_id: postId,
          analysis_status: "failed",
          safety_status: "needs_review",
          error_message: e instanceof Error ? e.message.slice(0, 500) : "unknown",
          duration_ms: Date.now() - startedAt,
        }, { onConflict: "post_id" });
      } catch { /* noop */ }
      try {
        await admin.from("posts").update({
          moderation_status: "pending_review",
          publish_status: "pending_review",
        }).eq("id", postId);
      } catch { /* noop */ }
    }
    return new Response(JSON.stringify({ ok: false, error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
