// Auto-generate accessibility alt text for an uploaded photo via Lovable AI.
//
// Caller posts { image_url } and gets back { alt }: a single concise sentence
// under 140 chars suitable for screen readers.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You write accessibility alt-text for social-media photos.
Rules:
- One sentence, under 140 characters.
- Describe the subject, action, and notable visual context — no hashtags, no hype.
- Do not start with "Image of" or "Photo of".
- Plain English, no emoji.
- If you cannot identify anything, return "Photo".`

// SSRF guard: only accept URLs that reference this project's Supabase Storage.
// Prevents callers passing arbitrary http(s) URLs to the AI gateway.
const ALLOWED_BUCKETS = new Set(['avatars', 'posts', 'media', 'banners', 'share-cards'])
function isAllowedStorageUrl(url: string, supabaseUrl: string): boolean {
  if (typeof url !== 'string' || !url) return false
  let parsed: URL
  try { parsed = new URL(url) } catch { return false }
  let base: URL
  try { base = new URL(supabaseUrl) } catch { return false }
  if (parsed.origin !== base.origin) return false
  // /storage/v1/object/(public|sign)/{bucket}/{path...}
  const m = parsed.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\/.+/)
  if (!m) return false
  return ALLOWED_BUCKETS.has(m[2])
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supa = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await supa.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const rawUrl = typeof body?.image_url === 'string' ? body.image_url : ''
    const url = isAllowedStorageUrl(rawUrl, supabaseUrl) ? rawUrl : null
    if (!url) {
      return new Response(JSON.stringify({ error: 'image_url must reference CrownMe storage' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }


    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ alt: '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: 'Write alt text for this photo.' },
            { type: 'image_url', image_url: { url } },
          ]},
        ],
      }),
    })

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: 'credits_exhausted' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!aiRes.ok) {
      console.error('AI error', aiRes.status, await aiRes.text())
      return new Response(JSON.stringify({ alt: '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await aiRes.json()
    const raw = (data?.choices?.[0]?.message?.content ?? '').toString().trim()
    const alt = raw.replace(/^["']|["']$/g, '').slice(0, 140)
    return new Response(JSON.stringify({ alt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('generate-alt-text error', e)
    return new Response(JSON.stringify({ alt: '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
