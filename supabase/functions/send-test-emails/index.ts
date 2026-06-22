// Admin-only test endpoint: emails the authenticated caller a copy of every
// registered template (all 20 — 14 transactional + 6 auth design tests).
// Uses safeParse so missing/malformed previewData can never break rendering.

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { safeParse } from '../_shared/transactional-email-templates/_validate.ts'

const SITE_NAME = 'crownmemedia'
const SENDER_DOMAIN = 'support.crownmemedia.com'
const FROM_DOMAIN = 'support.crownmemedia.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const callerToken = authHeader.replace('Bearer ', '')
  const authClient = createClient(supabaseUrl, anonKey)
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(callerToken)
  const claims = (claimsData as any)?.claims
  if (claimsErr || !claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // Admin gate via has_role; non-admins can still self-test (forced recipient).
  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: claims.sub,
    _role: 'admin',
  })

  // Parse optional override recipient (admin-only)
  let overrideRecipient: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.recipientEmail === 'string') overrideRecipient = body.recipientEmail.trim()
  } catch {/* ignore */}

  // Non-admins are forced to send to themselves only — prevents abuse.
  const recipient = (isAdmin && overrideRecipient) || (claims.email as string | undefined)
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return new Response(JSON.stringify({ error: 'No usable recipient email on JWT' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const normalized = recipient.toLowerCase()

  // Pre-flight: ensure recipient isn't suppressed
  const { data: suppressed } = await supabase
    .from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (suppressed) {
    return new Response(JSON.stringify({ error: 'Recipient is suppressed', recipient }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Ensure unsubscribe token exists once for this recipient
  let unsubscribeToken: string
  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else {
    unsubscribeToken = generateToken()
    await supabase.from('email_unsubscribe_tokens').upsert(
      { token: unsubscribeToken, email: normalized },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    const { data: storedToken } = await supabase
      .from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    if (storedToken?.token) unsubscribeToken = storedToken.token
  }

  const results: Array<{
    templateName: string
    status: 'queued' | 'render_failed' | 'enqueue_failed'
    error?: string
    messageId?: string
  }> = []

  for (const [templateName, entry] of Object.entries(TEMPLATES)) {
    const messageId = crypto.randomUUID()
    const raw = entry.previewData ?? {}
    const data = entry.schema ? safeParse(entry.schema, raw) : raw

    let html: string, text: string, subject: string
    try {
      html = await renderAsync(React.createElement(entry.component, data))
      text = await renderAsync(React.createElement(entry.component, data), { plainText: true })
      subject = typeof entry.subject === 'function' ? entry.subject(data) : entry.subject
    } catch (err) {
      results.push({
        templateName,
        status: 'render_failed',
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    // Log pending row
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'pending',
    })

    const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `[TEST] ${subject}`,
        html,
        text,
        purpose: 'transactional',
        label: `test:${templateName}`,
        idempotency_key: `test-${templateName}-${messageId}`,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueErr) {
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'failed',
        error_message: `Enqueue failed: ${enqueueErr.message}`,
      })
      results.push({ templateName, status: 'enqueue_failed', error: enqueueErr.message, messageId })
      continue
    }

    results.push({ templateName, status: 'queued', messageId })
  }

  const queued = results.filter((r) => r.status === 'queued').length
  return new Response(JSON.stringify({
    recipient,
    total: results.length,
    queued,
    failed: results.length - queued,
    results,
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
