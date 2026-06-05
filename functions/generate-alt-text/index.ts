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
    const url = typeof body?.image_url === 'string' && /^https?:\/\//.test(body.image_url) ? body.image_url : null
    if (!url) {
      return new Response(JSON.stringify({ error: 'image_url required' }), {
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
