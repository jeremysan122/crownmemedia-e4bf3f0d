// Pre-publish NSFW / safety screen for photos AND video frames.
//
// Posts the image URLs to Lovable AI Gateway (Gemini 2.5 Flash with vision)
// and asks for a structured JSON verdict. Logs every verdict to
// `moderation_audit` so repeat offenders can be reviewed.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ModerateBody {
  image_urls?: unknown
  kind?: unknown // "photo" | "video"
}

interface Verdict {
  safe: boolean
  category: 'safe' | 'suggestive' | 'explicit' | 'violence' | 'hate' | 'other'
  confidence: number
  reason: string
}

const SYSTEM = `You are a strict content-safety classifier for a social photo/video app.
Inspect every image (for video calls these are sampled frames) and return one JSON object with:
- safe (boolean): true only if every image is appropriate for a general audience
- category: one of "safe", "suggestive", "explicit", "violence", "hate", "other"
- confidence: number 0..1
- reason: short string (<=120 chars) describing the worst issue found, or "ok"

Block (safe=false) for: nudity, sexual content, graphic violence/gore, hate symbols,
illegal acts. Allow swimwear, art, tattoos, athletic context. When uncertain, prefer
safe=false with category="suggestive".`

// SSRF guard: only accept URLs that reference this project's Supabase Storage.
const ALLOWED_BUCKETS = new Set(['avatars', 'posts', 'media', 'banners', 'share-cards'])
function isAllowedStorageUrl(url: string, supabaseUrl: string): boolean {
  if (typeof url !== 'string' || !url) return false
  let parsed: URL
  try { parsed = new URL(url) } catch { return false }
  let base: URL
  try { base = new URL(supabaseUrl) } catch { return false }
  if (parsed.origin !== base.origin) return false
  const m = parsed.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\/.+/)
  if (!m) return false
  return ALLOWED_BUCKETS.has(m[2])
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ─── Auth check ───
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supa = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await supa.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    // ─── Input ───
    const body = (await req.json().catch(() => ({}))) as ModerateBody
    const urls = Array.isArray(body.image_urls)
      ? body.image_urls
          .filter((u): u is string => typeof u === 'string' && isAllowedStorageUrl(u, supabaseUrl))
          .slice(0, 10)
      : []
    const kind: 'photo' | 'video' = body.kind === 'video' ? 'video' : 'photo'
    if (urls.length === 0) {
      return new Response(JSON.stringify({ error: 'image_urls must reference CrownMe storage' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ safe: true, category: 'safe', confidence: 0, reason: 'moderation disabled' } satisfies Verdict), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: `Classify every ${kind === 'video' ? 'video frame' : 'image'}. Respond with one JSON object only.` },
      ...urls.map((u) => ({ type: 'image_url', image_url: { url: u } })),
    ]

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (aiRes.status === 429) {
      // Fail closed: client must retry; do NOT allow content through unchecked.
      return new Response(JSON.stringify({ safe: false, category: 'other', confidence: 0, reason: 'moderation rate limited, please retry' } satisfies Verdict), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
      })
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!aiRes.ok) {
      console.error('AI error', aiRes.status, await aiRes.text())
      // Fail closed on unexpected AI errors.
      return new Response(JSON.stringify({ safe: false, category: 'other', confidence: 0, reason: 'moderation check failed' } satisfies Verdict), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await aiRes.json()
    const raw = data?.choices?.[0]?.message?.content ?? '{}'
    let parsed: Partial<Verdict> = {}
    try { parsed = JSON.parse(raw) } catch { /* leave empty */ }
    const verdict: Verdict = {
      safe: parsed.safe !== false,
      category: (parsed.category as Verdict['category']) ?? 'safe',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : 'ok',
    }

    // ─── Audit log (service role bypasses RLS) ───
    try {
      const admin = createClient(supabaseUrl, serviceKey)
      await admin.from('moderation_audit').insert({
        user_id: userId,
        kind,
        safe: verdict.safe,
        category: verdict.category,
        confidence: verdict.confidence,
        reason: verdict.reason,
        image_urls: urls,
      })
    } catch (e) {
      console.warn('audit insert failed', e)
    }

    return new Response(JSON.stringify(verdict), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('moderate-media error', e)
    // Fail closed on unexpected errors.
    return new Response(JSON.stringify({ safe: false, category: 'other', confidence: 0, reason: 'moderation check failed' } satisfies Verdict), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
