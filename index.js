/**
 * AgentsMail API — Cloudflare Worker
 * Email addresses for AI agents: send, receive, search, thread via REST API
 * Open source: https://github.com/agentsmail/agentsmail
 */

const DOMAIN = 'agentsmail.net'
const VERSION = '2.0.0'

// ── Plan tiers ──
const PLANS = {
  free: { max_mailboxes: 5, max_messages_per_mailbox: 200, max_sends_per_day: 50, max_webhooks: 2 },
  developer: { max_mailboxes: 25, max_messages_per_mailbox: 1000, max_sends_per_day: 500, max_webhooks: 5 },
  startup: { max_mailboxes: 100, max_messages_per_mailbox: 5000, max_sends_per_day: 5000, max_webhooks: 10 },
}

// Global safety caps — prevents runaway bills regardless of how many accounts exist
const GLOBAL_LIMITS = {
  max_signups_per_day: 100,    // max 100 new accounts per day
  max_sends_per_day: 500,      // max 500 outbound emails per day across ALL accounts
}

const MAX_BODY_SIZE = 1024 * 1024 // 1MB request body limit

// Per-key read/search rate limits
const READ_RATE_LIMIT = { limit: 120, windowSec: 60 }   // 120 reads per minute per API key
const SEARCH_RATE_LIMIT = { limit: 30, windowSec: 60 }  // 30 searches per minute per API key

// Brute-force protection: lock out after N failed auth attempts per IP
const AUTH_FAIL_LIMIT = { limit: 15, windowSec: 900 }   // 15 failures per 15 min per IP

// ── Helpers ──

async function hashApiKey(key) {
  const encoded = new TextEncoder().encode(key)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time string comparison — prevents timing oracle attacks on secrets.
// Uses HMAC with a fresh random key so equal inputs always take the same time.
async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
  ])
  const arrA = new Uint8Array(sigA)
  const arrB = new Uint8Array(sigB)
  // HMAC output length is fixed (32 bytes for SHA-256) — no length leak
  let diff = 0
  for (let i = 0; i < arrA.length; i++) diff |= arrA[i] ^ arrB[i]
  return diff === 0
}

function generateId(len = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  for (const b of arr) id += chars[b % chars.length]
  return id
}

function generateApiKey() {
  return 'am_' + generateId(32)
}

function generateMessageId() {
  return `<${generateId(24)}@${DOMAIN}>`
}

function corsHeaders(env) {
  const origin = env?.CORS_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data, status = 200, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(env) },
  })
}

function error(message, status = 400, env) {
  return json({ error: message }, status, env)
}

function getApiKey(request) {
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return null
}

async function authenticate(request, env) {
  const apiKey = getApiKey(request)
  if (!apiKey) return null

  // Brute-force protection: check failed auth attempts per IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const failKey = `auth_fail:${ip}`
  const failCount = parseInt(await env.RATE_LIMITS.get(failKey) || '0')
  if (failCount >= AUTH_FAIL_LIMIT.limit) {
    console.warn(`[SECURITY] Auth locked out for IP ${ip} (${failCount} failures)`)
    await trackEvent('auth_lockout', env)
    return null
  }

  try {
    const keyHash = await hashApiKey(apiKey)
    const raw = await env.ACCOUNTS.get(`key:${keyHash}`)
    if (!raw) {
      // Fallback: check unhashed key for backwards compatibility with existing accounts
      const legacyRaw = await env.ACCOUNTS.get(`key:${apiKey}`)
      if (!legacyRaw) {
        // Record failed attempt
        await env.RATE_LIMITS.put(failKey, String(failCount + 1), { expirationTtl: AUTH_FAIL_LIMIT.windowSec })
        console.warn(`[SECURITY] Failed auth attempt from IP ${ip} (attempt ${failCount + 1})`)
        await trackEvent('auth_failure', env)
        return null
      }
      // Migrate to hashed key on successful auth
      const account = JSON.parse(legacyRaw)
      account.key_hash = keyHash
      await Promise.all([
        env.ACCOUNTS.put(`key:${keyHash}`, JSON.stringify(account)),
        env.ACCOUNTS.put(`account:${account.id}`, JSON.stringify(account)),
        env.ACCOUNTS.delete(`key:${apiKey}`),
      ])
      return account
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveAccount(account, env) {
  const keyHash = account.key_hash || await hashApiKey(account.api_key)
  await Promise.all([
    env.ACCOUNTS.put(`account:${account.id}`, JSON.stringify(account)),
    env.ACCOUNTS.put(`key:${keyHash}`, JSON.stringify(account)),
  ])
}

// Analytics: increment a daily counter in RATE_LIMITS KV
async function trackEvent(name, env) {
  const date = new Date().toISOString().slice(0, 10)
  const key = `stats:${date}:${name}`
  try {
    const current = parseInt(await env.RATE_LIMITS.get(key) || '0')
    await env.RATE_LIMITS.put(key, String(current + 1), { expirationTtl: 604800 }) // keep 7 days
  } catch { /* best-effort */ }
}

async function checkRateLimit(key, limit, windowSec, env) {
  try {
    const current = parseInt(await env.RATE_LIMITS.get(key) || '0')
    if (current >= limit) return false
    await env.RATE_LIMITS.put(key, String(current + 1), { expirationTtl: windowSec })
    return true
  } catch {
    return true
  }
}

// ── Parse raw email (handles multipart MIME, threading headers, attachments) ──
function parseRawEmail(rawText) {
  // Split headers and body — handle both \r\n\r\n and \n\n
  let headerEnd = rawText.indexOf('\r\n\r\n')
  let bodySep = 4
  if (headerEnd === -1) {
    headerEnd = rawText.indexOf('\n\n')
    bodySep = 2
  }
  const headerBlock = headerEnd > -1 ? rawText.slice(0, headerEnd) : rawText
  const bodyBlock = headerEnd > -1 ? rawText.slice(headerEnd + bodySep) : ''

  // Unfold headers (continuation lines start with space/tab)
  const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, ' ')

  function getHeader(name) {
    const re = new RegExp(`^${name}:\\s*(.+)`, 'im')
    const m = unfoldedHeaders.match(re)
    return m ? m[1].trim() : ''
  }

  let from = getHeader('From')
  let to = getHeader('To')
  const subject = getHeader('Subject') || '(no subject)'
  const messageId = getHeader('Message-ID') || getHeader('Message-Id')
  const inReplyTo = getHeader('In-Reply-To')
  const references = getHeader('References')
  const date = getHeader('Date')

  // Extract email from "Name <email>" format
  if (from.includes('<')) from = from.match(/<(.+?)>/)?.[1] || from
  if (to.includes('<')) to = to.match(/<(.+?)>/)?.[1] || to

  let bodyPlain = ''
  let bodyHtml = ''
  const attachments = []

  const contentType = getHeader('Content-Type')
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/)

  if (boundaryMatch) {
    const boundary = boundaryMatch[1]
    const parts = bodyBlock.split('--' + boundary)

    for (const part of parts) {
      if (part.trim() === '' || part.trim() === '--') continue

      // Find header/body split in this part
      let partHeaderEnd = part.indexOf('\r\n\r\n')
      let partBodySep = 4
      if (partHeaderEnd === -1) {
        partHeaderEnd = part.indexOf('\n\n')
        partBodySep = 2
      }
      if (partHeaderEnd === -1) continue

      const partHeaders = part.slice(0, partHeaderEnd)
      const partBody = part.slice(partHeaderEnd + partBodySep).replace(/\r?\n$/, '')
      const partHeadersLower = partHeaders.toLowerCase()

      // Check for nested multipart (e.g. multipart/alternative inside multipart/mixed)
      const nestedBoundaryMatch = partHeaders.match(/boundary="?([^";\s]+)"?/i)
      if (nestedBoundaryMatch) {
        const nestedBoundary = nestedBoundaryMatch[1]
        const nestedParts = partBody.split('--' + nestedBoundary)
        for (const np of nestedParts) {
          if (np.trim() === '' || np.trim() === '--') continue
          let npHeaderEnd = np.indexOf('\r\n\r\n')
          let npBodySep = 4
          if (npHeaderEnd === -1) {
            npHeaderEnd = np.indexOf('\n\n')
            npBodySep = 2
          }
          if (npHeaderEnd === -1) continue
          const npHeaders = np.slice(0, npHeaderEnd).toLowerCase()
          const npBody = np.slice(npHeaderEnd + npBodySep).replace(/\r?\n$/, '')
          if (npHeaders.includes('text/plain') && !bodyPlain) bodyPlain = npBody.trim()
          else if (npHeaders.includes('text/html') && !bodyHtml) bodyHtml = npBody.trim()
        }
        continue
      }

      if (partHeadersLower.includes('text/plain') && !bodyPlain) {
        bodyPlain = partBody.trim()
      } else if (partHeadersLower.includes('text/html') && !bodyHtml) {
        bodyHtml = partBody.trim()
      } else {
        // Attachment
        const nameMatch = partHeaders.match(/name="?([^";\r\n]+)"?/i)
        const filenameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i)
        const ctMatch = partHeaders.match(/Content-Type:\s*([^\s;]+)/i)
        const filename = filenameMatch?.[1] || nameMatch?.[1] || 'attachment'
        const mimeType = ctMatch?.[1] || 'application/octet-stream'

        // Check content-transfer-encoding
        const isBase64 = partHeadersLower.includes('base64')
        const content = isBase64 ? partBody.replace(/\s/g, '') : btoa(partBody)

        if (content.length > 0 && content.length < 5000000) { // Max ~3.7MB per attachment
          attachments.push({
            id: generateId(12),
            filename: filename.trim(),
            content_type: mimeType.trim(),
            size: Math.floor(content.length * 0.75), // approx decoded size
            content_base64: content,
          })
        }
      }
    }
  } else {
    if (contentType.includes('text/html')) {
      bodyHtml = bodyBlock
    } else {
      bodyPlain = bodyBlock
    }
  }

  return { from, to, subject, bodyPlain, bodyHtml, messageId, inReplyTo, references, date, attachments }
}

// Derive thread_id from email threading headers
function deriveThreadId(messageId, inReplyTo, references) {
  // Use the first message-id in references chain, or in-reply-to, or self
  if (references) {
    const firstRef = references.match(/<[^>]+>/)?.[0]
    if (firstRef) return firstRef
  }
  if (inReplyTo) return inReplyTo
  return messageId || `<${generateId(16)}@${DOMAIN}>`
}

// ── Webhook delivery with retries and HMAC signing ──
async function fireWebhooks(account, event, payload, ctx) {
  const accountSecret = account.webhook_secret || null

  if (!account.webhooks || account.webhooks.length === 0) {
    // Legacy single webhook support
    if (account.webhook_url) {
      ctx.waitUntil(deliverWebhook(account.webhook_url, event, payload, accountSecret))
    }
    return
  }

  for (const wh of account.webhooks) {
    if (wh.events && wh.events.length > 0 && !wh.events.includes(event)) continue
    // Per-webhook secret overrides account-level secret if present
    ctx.waitUntil(deliverWebhook(wh.url, event, payload, wh.secret || accountSecret))
  }
}

async function deliverWebhook(url, event, payload, secret) {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })

  // FIX: Sign every outbound webhook with HMAC-SHA256 so receivers can verify authenticity.
  // Consumers should validate: X-AgentsMail-Signature == "sha256=<hmac(body, webhook_secret)>"
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'AgentsMail-Webhook/2.0',
  }

  if (secret) {
    try {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
      const hexSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
      headers['X-AgentsMail-Signature'] = `sha256=${hexSig}`
    } catch (e) {
      console.error('Failed to sign webhook:', e.message)
    }
  }

  const delays = [0, 2000, 10000] // immediate, 2s, 10s retries

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]))
    try {
      const res = await fetch(url, { method: 'POST', headers, body })
      if (res.ok || res.status < 500) return // success or client error (don't retry)
    } catch (e) {
      console.error(`Webhook attempt ${attempt + 1} failed for ${url}:`, e.message)
    }
  }
}

// ── Route handlers ──

// POST /api/signup
async function handleSignup(request, env) {
  let body
  try { body = await request.json() } catch { return error('Invalid JSON body', 400, env) }

  const { email, name, first_mailbox } = body || {}
  if (!email || !email.includes('@')) return error('Valid email is required', 400, env)

  const existing = await env.ACCOUNTS.get(`email:${email}`)
  if (existing) return error('Unable to create account. If you already have an account, use your existing API key.', 409, env)

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const allowed = await checkRateLimit(`signup:${ip}`, 5, 3600, env)
  if (!allowed) return error('Too many signups. Try again later.', 429, env)

  // Global signup cap
  const globalSignupOk = await checkRateLimit(`global:signups:${new Date().toISOString().slice(0, 10)}`, GLOBAL_LIMITS.max_signups_per_day, 86400, env)
  if (!globalSignupOk) return error('Service at capacity. Please try again tomorrow.', 503, env)

  // If first_mailbox requested, check availability before creating account
  let firstMailboxAddress = null
  if (first_mailbox) {
    const localPart = first_mailbox.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30)
    if (!localPart) return error('Invalid mailbox name', 400, env)
    firstMailboxAddress = `${localPart}@${DOMAIN}`
    const taken = await env.MAILBOXES.get(`mailbox:${firstMailboxAddress}`)
    if (taken) return error(`${firstMailboxAddress} is already taken. Try a different name.`, 409, env)
  }

  const accountId = generateId(12)
  const apiKey = generateApiKey()
  const keyHash = await hashApiKey(apiKey)
  const plan = 'free'
  const account = {
    id: accountId,
    email,
    name: name || '',
    key_hash: keyHash,
    mailboxes: [],
    webhooks: [],
    webhook_url: null,
    webhook_secret: generateId(32),
    verified: false,
    verification_token: generateId(24),
    created_at: new Date().toISOString(),
    plan,
    limits: { ...PLANS[plan] },
  }

  // Create first mailbox if requested
  if (firstMailboxAddress) {
    const mailbox = {
      address: firstMailboxAddress, account_id: accountId,
      name: first_mailbox, messages: [], created_at: new Date().toISOString(),
    }
    await env.MAILBOXES.put(`mailbox:${firstMailboxAddress}`, JSON.stringify(mailbox))
    account.mailboxes.push(firstMailboxAddress)
  }

  await Promise.all([
    env.ACCOUNTS.put(`account:${accountId}`, JSON.stringify(account)),
    env.ACCOUNTS.put(`key:${keyHash}`, JSON.stringify(account)),
    env.ACCOUNTS.put(`email:${email}`, JSON.stringify({ account_id: accountId })),
  ])

  // Send verification email via Mailgun
  if (env.MAILGUN_API_KEY) {
    const mailgunDomain = env.MAILGUN_DOMAIN || DOMAIN
    const verifyUrl = `https://api.${DOMAIN}/api/account/verify?token=${account.verification_token}&id=${accountId}`
    const verifyBody = new FormData()
    verifyBody.append('from', `AgentsMail <noreply@${mailgunDomain}>`)
    verifyBody.append('to', email)
    verifyBody.append('subject', 'Verify your AgentsMail account')
    verifyBody.append('text', `Welcome to AgentsMail!\n\nPlease verify your account by visiting:\n${verifyUrl}\n\nOr use the API:\ncurl -X POST https://api.${DOMAIN}/api/account/verify \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"token": "${account.verification_token}"}'\n\nYou can read emails immediately, but sending requires verification.\n\n— AgentsMail`)
    verifyBody.append('html', `<p>Welcome to AgentsMail!</p><p><a href="${verifyUrl}">Click here to verify your account</a></p><p>You can read emails immediately, but sending requires verification.</p><p style="color:#888;font-size:12px">— AgentsMail</p>`)
    try {
      await fetch(`https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + btoa('api:' + env.MAILGUN_API_KEY) },
        body: verifyBody,
      })
    } catch (e) { console.error('Failed to send verification email:', e.message) }
  }

  const result = {
    message: 'Account created. Check your email to verify.', account_id: accountId, api_key: apiKey,
    email, plan, limits: account.limits, verified: false,
  }
  if (firstMailboxAddress) result.first_mailbox = firstMailboxAddress

  await trackEvent('signup', env)
  return json(result, 201, env)
}

// GET /api/account
async function handleGetAccount(request, env) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  return json({
    id: account.id, email: account.email, name: account.name,
    mailboxes: account.mailboxes, webhooks: account.webhooks || [],
    webhook_url: account.webhook_url,
    webhook_secret: account.webhook_secret || null,
    verified: account.verified !== false,
    plan: account.plan, limits: account.limits,
    created_at: account.created_at,
  }, 200, env)
}

// POST /api/account/verify — verify account via token
async function handleVerifyAccount(request, env) {
  const url = new URL(request.url)

  // Support GET with query params (email link) or POST with bearer + JSON body
  let account, token
  if (request.method === 'GET') {
    token = url.searchParams.get('token')
    const accountId = url.searchParams.get('id')
    if (!token || !accountId) return error('Missing token or id', 400, env)
    const raw = await env.ACCOUNTS.get(`account:${accountId}`)
    if (!raw) return error('Account not found', 404, env)
    account = JSON.parse(raw)
  } else {
    account = await authenticate(request, env)
    if (!account) return error('Unauthorized', 401, env)
    try {
      const body = await request.json()
      token = body.token
    } catch { return error('Invalid JSON body', 400, env) }
  }

  if (!token) return error('Verification token required', 400, env)

  if (account.verified) return json({ message: 'Account already verified', verified: true }, 200, env)

  if (account.verification_token !== token) {
    return error('Invalid verification token', 403, env)
  }

  account.verified = true
  delete account.verification_token
  await saveAccount(account, env)
  // Also update the account record by ID
  await env.ACCOUNTS.put(`account:${account.id}`, JSON.stringify(account))

  console.log(`[ACCOUNT] Verified: ${account.email} (${account.id})`)
  return json({ message: 'Account verified', verified: true }, 200, env)
}

// POST /api/account/rotate-key
async function handleRotateKey(request, env) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  // Delete old hashed key
  const oldHash = account.key_hash
  if (oldHash) await env.ACCOUNTS.delete(`key:${oldHash}`)

  // Generate new key
  const newApiKey = generateApiKey()
  const newHash = await hashApiKey(newApiKey)
  account.key_hash = newHash

  await Promise.all([
    env.ACCOUNTS.put(`account:${account.id}`, JSON.stringify(account)),
    env.ACCOUNTS.put(`key:${newHash}`, JSON.stringify(account)),
  ])

  return json({ message: 'API key rotated', api_key: newApiKey }, 200, env)
}

// POST /api/mailboxes
async function handleCreateMailbox(request, env, ctx) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  let body
  try { body = await request.json() } catch { return error('Invalid JSON body', 400, env) }
  const { name } = body || {}

  if (account.mailboxes.length >= account.limits.max_mailboxes) {
    return error(`Mailbox limit reached (${account.limits.max_mailboxes}). Upgrade your plan.`, 403, env)
  }

  const localPart = name
    ? name.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30)
    : 'agent-' + generateId(8)
  const address = `${localPart}@${DOMAIN}`

  const existing = await env.MAILBOXES.get(`mailbox:${address}`)
  if (existing) return error('Address already taken. Try a different name.', 409, env)

  const mailbox = {
    address, account_id: account.id, name: name || localPart,
    messages: [], created_at: new Date().toISOString(),
  }

  await env.MAILBOXES.put(`mailbox:${address}`, JSON.stringify(mailbox))
  account.mailboxes.push(address)
  await saveAccount(account, env)

  if (ctx) fireWebhooks(account, 'mailbox.created', { address, name: mailbox.name }, ctx)

  return json({ message: 'Mailbox created', address, name: mailbox.name }, 201, env)
}

// GET /api/mailboxes
async function handleListMailboxes(request, env) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  const mailboxes = []
  for (const addr of account.mailboxes) {
    try {
      const raw = await env.MAILBOXES.get(`mailbox:${addr}`)
      if (raw) {
        const mb = JSON.parse(raw)
        mailboxes.push({
          address: mb.address, name: mb.name,
          message_count: mb.messages.length, created_at: mb.created_at,
        })
      }
    } catch { /* skip */ }
  }

  return json({ mailboxes }, 200, env)
}

// DELETE /api/mailboxes/:address
async function handleDeleteMailbox(request, env, address, ctx) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  await env.MAILBOXES.delete(`mailbox:${address}`)
  account.mailboxes = account.mailboxes.filter(a => a !== address)
  await saveAccount(account, env)

  if (ctx) fireWebhooks(account, 'mailbox.deleted', { address }, ctx)

  return json({ message: 'Mailbox deleted', address }, 200, env)
}

// GET /api/mailboxes/:address/messages
async function handleListMessages(request, env, address) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const url = new URL(request.url)
  const label = url.searchParams.get('label')
  const direction = url.searchParams.get('direction')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  const mailbox = JSON.parse(raw)
  let msgs = mailbox.messages

  if (label) msgs = msgs.filter(m => m.labels && m.labels.includes(label))
  if (direction) msgs = msgs.filter(m => m.direction === direction)

  const total = msgs.length
  msgs = msgs.slice(offset, offset + limit)

  const messages = msgs.map(m => ({
    id: m.id, from: m.from, to: m.to, subject: m.subject,
    preview: (m.body_plain || '').slice(0, 200),
    direction: m.direction, labels: m.labels || [],
    thread_id: m.thread_id || null,
    has_attachments: (m.attachments && m.attachments.length > 0) || false,
    received_at: m.received_at,
  }))

  return json({ address, messages, total, limit, offset }, 200, env)
}

// GET /api/mailboxes/:address/messages/:id
async function handleGetMessage(request, env, address, messageId) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const message = mailbox.messages.find(m => m.id === messageId)
  if (!message) return error('Message not found', 404, env)

  // Return everything except raw attachment content (use separate endpoint for that)
  const result = { ...message }
  if (result.attachments) {
    result.attachments = result.attachments.map(a => ({
      id: a.id, filename: a.filename, content_type: a.content_type, size: a.size,
    }))
  }

  return json(result, 200, env)
}

// GET /api/mailboxes/:address/messages/:id/attachments/:attachmentId
async function handleGetAttachment(request, env, address, messageId, attachmentId) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const message = mailbox.messages.find(m => m.id === messageId)
  if (!message) return error('Message not found', 404, env)
  if (!message.attachments) return error('No attachments', 404, env)

  const attachment = message.attachments.find(a => a.id === attachmentId)
  if (!attachment) return error('Attachment not found', 404, env)

  // Return base64-encoded content
  return json({
    id: attachment.id, filename: attachment.filename,
    content_type: attachment.content_type, size: attachment.size,
    content_base64: attachment.content_base64,
  }, 200, env)
}

// DELETE /api/mailboxes/:address/messages/:id
async function handleDeleteMessage(request, env, address, messageId) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const idx = mailbox.messages.findIndex(m => m.id === messageId)
  if (idx === -1) return error('Message not found', 404, env)

  mailbox.messages.splice(idx, 1)
  await env.MAILBOXES.put(`mailbox:${address}`, JSON.stringify(mailbox))

  return json({ message: 'Message deleted' }, 200, env)
}

// PUT /api/mailboxes/:address/messages/:id/labels
async function handleSetLabels(request, env, address, messageId) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  let body
  try { body = await request.json() } catch { return error('Invalid JSON body', 400, env) }
  const { labels } = body || {}
  if (!Array.isArray(labels)) return error('"labels" must be an array of strings', 400, env)
  if (labels.length > 20) return error('Maximum 20 labels per message', 400, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const message = mailbox.messages.find(m => m.id === messageId)
  if (!message) return error('Message not found', 404, env)

  message.labels = labels.map(l => String(l).toLowerCase().trim()).filter(Boolean)
  await env.MAILBOXES.put(`mailbox:${address}`, JSON.stringify(mailbox))

  return json({ message: 'Labels updated', labels: message.labels }, 200, env)
}

// GET /api/mailboxes/:address/threads
async function handleListThreads(request, env, address) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)

  // Group messages by thread_id
  const threadMap = {}
  for (const msg of mailbox.messages) {
    const tid = msg.thread_id || msg.id
    if (!threadMap[tid]) {
      threadMap[tid] = { thread_id: tid, subject: msg.subject, messages: [], last_activity: msg.received_at }
    }
    threadMap[tid].messages.push({
      id: msg.id, from: msg.from, to: msg.to, direction: msg.direction,
      preview: (msg.body_plain || '').slice(0, 100), received_at: msg.received_at,
    })
    // Update last activity
    if (msg.received_at > threadMap[tid].last_activity) {
      threadMap[tid].last_activity = msg.received_at
    }
  }

  const threads = Object.values(threadMap)
    .map(t => ({ ...t, message_count: t.messages.length }))
    .sort((a, b) => b.last_activity.localeCompare(a.last_activity))

  return json({ address, threads, total: threads.length }, 200, env)
}

// GET /api/mailboxes/:address/threads/:threadId
async function handleGetThread(request, env, address, threadId) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const messages = mailbox.messages
    .filter(m => m.thread_id === threadId)
    .map(m => {
      const result = { ...m }
      if (result.attachments) {
        result.attachments = result.attachments.map(a => ({
          id: a.id, filename: a.filename, content_type: a.content_type, size: a.size,
        }))
      }
      return result
    })
    .sort((a, b) => a.received_at.localeCompare(b.received_at))

  if (messages.length === 0) return error('Thread not found', 404, env)

  return json({ thread_id: threadId, address, messages, count: messages.length }, 200, env)
}

// GET /api/mailboxes/:address/search?q=query
async function handleSearchMailbox(request, env, address) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (!account.mailboxes.includes(address)) return error('Mailbox not found or not owned by you', 404, env)

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').toLowerCase().trim()
  if (!q) return error('Query parameter "q" is required', 400, env)
  if (q.length < 2) return error('Query must be at least 2 characters', 400, env)

  const raw = await env.MAILBOXES.get(`mailbox:${address}`)
  if (!raw) return error('Mailbox not found', 404, env)

  const mailbox = JSON.parse(raw)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50)

  const results = mailbox.messages
    .filter(m => {
      return (m.subject || '').toLowerCase().includes(q)
        || (m.from || '').toLowerCase().includes(q)
        || (m.to || '').toLowerCase().includes(q)
        || (m.body_plain || '').toLowerCase().includes(q)
    })
    .slice(0, limit)
    .map(m => ({
      id: m.id, from: m.from, to: m.to, subject: m.subject,
      preview: (m.body_plain || '').slice(0, 200),
      direction: m.direction, labels: m.labels || [],
      thread_id: m.thread_id || null, received_at: m.received_at,
    }))

  return json({ address, query: q, results, count: results.length }, 200, env)
}

// GET /api/search?q=query (search across all mailboxes)
async function handleSearchAll(request, env) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').toLowerCase().trim()
  if (!q) return error('Query parameter "q" is required', 400, env)
  if (q.length < 2) return error('Query must be at least 2 characters', 400, env)

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50)
  const results = []

  for (const addr of account.mailboxes) {
    if (results.length >= limit) break
    try {
      const raw = await env.MAILBOXES.get(`mailbox:${addr}`)
      if (!raw) continue
      const mailbox = JSON.parse(raw)
      for (const m of mailbox.messages) {
        if (results.length >= limit) break
        if (
          (m.subject || '').toLowerCase().includes(q)
          || (m.from || '').toLowerCase().includes(q)
          || (m.to || '').toLowerCase().includes(q)
          || (m.body_plain || '').toLowerCase().includes(q)
        ) {
          results.push({
            mailbox: addr, id: m.id, from: m.from, to: m.to, subject: m.subject,
            preview: (m.body_plain || '').slice(0, 200),
            direction: m.direction, labels: m.labels || [],
            thread_id: m.thread_id || null, received_at: m.received_at,
          })
        }
      }
    } catch { /* skip */ }
  }

  return json({ query: q, results, count: results.length }, 200, env)
}

// POST /api/mailboxes/:address/send
async function handleSendEmail(request, env, fromAddress, ctx) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)
  if (account.verified === false) return error('Account not verified. Check your email for the verification link.', 403, env)
  if (!account.mailboxes.includes(fromAddress)) return error('Mailbox not found or not owned by you', 404, env)

  const allowed = await checkRateLimit(
    `send:${account.id}:${new Date().toISOString().slice(0, 10)}`,
    account.limits.max_sends_per_day, 86400, env
  )
  if (!allowed) return error(`Daily send limit reached (${account.limits.max_sends_per_day}). Upgrade your plan.`, 429, env)

  // Global send cap — protects against runaway Mailgun bills
  const globalSendOk = await checkRateLimit(`global:sends:${new Date().toISOString().slice(0, 10)}`, GLOBAL_LIMITS.max_sends_per_day, 86400, env)
  if (!globalSendOk) return error('Service sending capacity reached for today. Please try again tomorrow.', 503, env)

  let body
  try { body = await request.json() } catch { return error('Invalid JSON body', 400, env) }

  const { to, subject, text, html, attachments, reply_to } = body || {}
  if (!to || !subject) return error('Fields "to", "subject" are required', 400, env)
  if (!text && !html) return error('Either "text" or "html" body is required', 400, env)

  // Build threading headers
  let inReplyToHeader = ''
  let referencesHeader = ''
  let threadId = null

  if (reply_to) {
    // Find the message we're replying to
    const raw = await env.MAILBOXES.get(`mailbox:${fromAddress}`)
    if (raw) {
      const mailbox = JSON.parse(raw)
      const replyMsg = mailbox.messages.find(m => m.id === reply_to)
      if (replyMsg) {
        inReplyToHeader = replyMsg.message_id_header || ''
        referencesHeader = [replyMsg.references || '', replyMsg.message_id_header || ''].filter(Boolean).join(' ')
        threadId = replyMsg.thread_id
      }
    }
  }

  const outboundMessageId = generateMessageId()
  if (!threadId) threadId = outboundMessageId

  // Send via Mailgun
  const mailgunDomain = env.MAILGUN_DOMAIN || DOMAIN
  const mailgunKey = env.MAILGUN_API_KEY
  if (!mailgunKey) return error('Email sending not configured', 500, env)

  const fromName = account.name || fromAddress.split('@')[0]

  // Use FormData for multipart support
  const formData = new FormData()
  formData.append('from', `${fromName} <${fromAddress}>`)
  formData.append('to', to)
  formData.append('subject', subject)
  const footer = '\n\n—\nSent with agentsmail.net'
  const htmlFooter = '<br><br><p style="color:#999;font-size:11px">Sent with <a href="https://agentsmail.net" style="color:#999">agentsmail.net</a></p>'
  if (text) formData.append('text', text + footer)
  if (html) formData.append('html', html + htmlFooter)
  formData.append('h:Message-ID', outboundMessageId)
  if (inReplyToHeader) formData.append('h:In-Reply-To', inReplyToHeader)
  if (referencesHeader) formData.append('h:References', referencesHeader)

  // Attach files
  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments.slice(0, 10)) { // max 10 attachments
      if (att.content_base64 && att.filename) {
        const binary = Uint8Array.from(atob(att.content_base64), c => c.charCodeAt(0))
        const blob = new Blob([binary], { type: att.content_type || 'application/octet-stream' })
        formData.append('attachment', blob, att.filename)
      }
    }
  }

  try {
    const res = await fetch(`https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + btoa('api:' + mailgunKey) },
      body: formData,
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Mailgun error:', res.status, errText)
      await trackEvent('send_failure', env)
      return error('Failed to send email. Please try again.', 502, env)
    }
  } catch (e) {
    console.error('Send error:', e)
    return error('Failed to send email', 500, env)
  }

  // Store outbound message
  const messageRecord = {
    id: generateId(16),
    message_id_header: outboundMessageId,
    thread_id: threadId,
    in_reply_to: inReplyToHeader || null,
    references: referencesHeader || null,
    from: fromAddress, to, subject,
    body_plain: text || '', body_html: html || '',
    direction: 'outbound',
    labels: [],
    attachments: attachments ? attachments.map(a => ({
      id: generateId(12), filename: a.filename,
      content_type: a.content_type || 'application/octet-stream',
      size: a.content_base64 ? Math.floor(a.content_base64.length * 0.75) : 0,
      content_base64: a.content_base64,
    })) : [],
    received_at: new Date().toISOString(),
  }

  const raw = await env.MAILBOXES.get(`mailbox:${fromAddress}`)
  if (raw) {
    const mailbox = JSON.parse(raw)
    mailbox.messages.unshift(messageRecord)
    const maxMessages = account.limits.max_messages_per_mailbox || 100
    if (mailbox.messages.length > maxMessages) {
      mailbox.messages = mailbox.messages.slice(0, maxMessages)
    }
    await env.MAILBOXES.put(`mailbox:${fromAddress}`, JSON.stringify(mailbox))
  }

  if (ctx) fireWebhooks(account, 'email.sent', {
    mailbox: fromAddress, id: messageRecord.id, to, subject, thread_id: threadId,
  }, ctx)

  await trackEvent('email_sent', env)
  return json({ message: 'Email sent', id: messageRecord.id, to, subject, thread_id: threadId }, 200, env)
}

// PUT /api/webhooks — set webhooks (new multi-webhook support)
async function handleSetWebhooks(request, env) {
  const account = await authenticate(request, env)
  if (!account) return error('Unauthorized', 401, env)

  let body
  try { body = await request.json() } catch { return error('Invalid JSON body', 400, env) }

  // Support both legacy single URL and new multi-webhook format
  if (body.url !== undefined) {
    // Legacy format: { url: "..." }
    if (body.url && !body.url.startsWith('https://')) {
      return error('Webhook URL must use HTTPS', 400, env)
    }
    if (body.url && isPrivateWebhookUrl(body.url)) {
      return error('Webhook URL must not target private/internal networks', 400, env)
    }
    account.webhook_url = body.url || null
    await saveAccount(account, env)
    return json({ message: body.url ? 'Webhook set' : 'Webhook removed', webhook_url: account.webhook_url }, 200, env)
  }

  // New format: { webhooks: [{ url, events }] }
  const { webhooks } = body || {}
  if (!Array.isArray(webhooks)) return error('"webhooks" must be an array', 400, env)
  if (webhooks.length > account.limits.max_webhooks) {
    return error(`Maximum ${account.limits.max_webhooks} webhooks on your plan`, 403, env)
  }

  const validEvents = ['email.received', 'email.sent', 'mailbox.created', 'mailbox.deleted']

  for (const wh of webhooks) {
    if (!wh.url || !wh.url.startsWith('https://')) return error('All webhook URLs must use HTTPS', 400, env)
    if (isPrivateWebhookUrl(wh.url)) return error('Webhook URLs must not target private/internal networks', 400, env)
    if (wh.events && !Array.isArray(wh.events)) return error('"events" must be an array', 400, env)
    if (wh.events) {
      for (const ev of wh.events) {
        if (!validEvents.includes(ev)) return error(`Invalid event: ${ev}. Valid: ${validEvents.join(', ')}`, 400, env)
      }
    }
  }

  account.webhooks = webhooks.map(wh => ({
    id: generateId(8),
    url: wh.url,
    events: wh.events || [], // empty = all events
    created_at: new Date().toISOString(),
  }))

  await saveAccount(account, env)

  return json({ message: 'Webhooks updated', webhooks: account.webhooks }, 200, env)
}

// Block webhook URLs targeting private/internal networks (SSRF protection)
function isPrivateWebhookUrl(urlStr) {
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()
    // Block localhost, link-local, and common internal hostnames
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true
    if (host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) return true
    // Block private IP ranges: 10.x, 172.16-31.x, 192.168.x, 169.254.x (link-local)
    const parts = host.split('.')
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number)
      if (a === 10) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      if (a === 169 && b === 254) return true
      if (a === 127) return true
      if (a === 0) return true
    }
    // Block non-standard ports commonly used for internal services
    if (u.port && ['6379', '3306', '5432', '27017', '9200', '8500', '2379'].includes(u.port)) return true
    return false
  } catch { return true }
}

// Verify Mailgun webhook signature
async function verifyMailgunSignature(timestamp, token, signature, apiKey) {
  // Replay protection: reject timestamps older than 5 minutes
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (isNaN(age) || age > 300) return false

  const encoded = new TextEncoder().encode(timestamp + token)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoded)
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === signature
}

// POST /webhook/inbound — receive from Mailgun or other HTTP sources
async function handleInboundEmail(request, env, ctx) {
  // Require INBOUND_SECRET as a mandatory second factor for webhook ingress.
  // Fail-closed: if INBOUND_SECRET is not configured, reject all inbound webhooks.
  if (!env.INBOUND_SECRET) {
    console.error('INBOUND_SECRET not configured — rejecting inbound webhook')
    return error('Inbound webhooks not configured', 503, env)
  }
  const providedSecret = request.headers.get('X-Inbound-Secret') || ''
  if (!(await timingSafeEqual(providedSecret, env.INBOUND_SECRET))) {
    return error('Unauthorized', 403, env)
  }

  let recipient, sender, subject, bodyPlain, bodyHtml

  const contentType = request.headers.get('Content-Type') || ''

  if (contentType.includes('application/json')) {
    const body = await request.json()

    // FIX: When MAILGUN_API_KEY is set, signature is REQUIRED — not optional.
    // Previously an attacker could omit signature fields entirely to bypass verification.
    if (env.MAILGUN_API_KEY) {
      const { timestamp, token, signature } = (body.signature || {})
      if (!timestamp || !token || !signature) {
        return error('Missing Mailgun signature fields', 403, env)
      }
      const valid = await verifyMailgunSignature(timestamp, token, signature, env.MAILGUN_API_KEY)
      if (!valid) return error('Invalid webhook signature', 403, env)
    }

    recipient = body.to || body.recipient
    sender = body.from || body.sender
    subject = body.subject || '(no subject)'
    bodyPlain = body.text || body['body-plain'] || ''
    bodyHtml = body.html || body['body-html'] || ''
  } else {
    const formData = await request.formData()

    // FIX: Same enforcement for multipart/form-data submissions from Mailgun.
    if (env.MAILGUN_API_KEY) {
      const timestamp = formData.get('timestamp')
      const token = formData.get('token')
      const signature = formData.get('signature')
      if (!timestamp || !token || !signature) {
        return error('Missing Mailgun signature fields', 403, env)
      }
      const valid = await verifyMailgunSignature(timestamp, token, signature, env.MAILGUN_API_KEY)
      if (!valid) return error('Invalid webhook signature', 403, env)
    }

    recipient = formData.get('recipient') || formData.get('To')
    sender = formData.get('sender') || formData.get('from') || formData.get('From')
    subject = formData.get('subject') || formData.get('Subject') || '(no subject)'
    bodyPlain = formData.get('body-plain') || formData.get('text') || ''
    bodyHtml = formData.get('body-html') || formData.get('html') || ''
  }

  if (!recipient) return error('Missing recipient', 400, env)

  recipient = recipient.toLowerCase().trim()
  if (recipient.includes('<')) recipient = recipient.match(/<(.+?)>/)?.[1] || recipient

  const raw = await env.MAILBOXES.get(`mailbox:${recipient}`)
  if (!raw) {
    console.log(`Inbound email for unknown mailbox: ${recipient}`)
    return json({ message: 'Mailbox not found, email discarded' }, 200, env)
  }

  const mailbox = JSON.parse(raw)

  if (bodyPlain.length > 100000) bodyPlain = bodyPlain.slice(0, 100000)
  if (bodyHtml.length > 100000) bodyHtml = bodyHtml.slice(0, 100000)

  const msgId = generateId(16)
  const message = {
    id: msgId, from: sender, to: recipient, subject,
    body_plain: bodyPlain, body_html: bodyHtml,
    direction: 'inbound', labels: [], attachments: [],
    thread_id: `<${msgId}@${DOMAIN}>`,
    message_id_header: null, in_reply_to: null, references: null,
    received_at: new Date().toISOString(),
  }

  mailbox.messages.unshift(message)

  const accountRaw = await env.ACCOUNTS.get(`account:${mailbox.account_id}`)
  const account = accountRaw ? JSON.parse(accountRaw) : null
  const maxMessages = account?.limits?.max_messages_per_mailbox || 100

  if (mailbox.messages.length > maxMessages) {
    mailbox.messages = mailbox.messages.slice(0, maxMessages)
  }

  await env.MAILBOXES.put(`mailbox:${recipient}`, JSON.stringify(mailbox))

  if (account && ctx) {
    fireWebhooks(account, 'email.received', {
      mailbox: recipient, id: msgId, from: sender, subject,
      preview: bodyPlain.slice(0, 300), received_at: message.received_at,
    }, ctx)
  }

  return json({ message: 'Email received', id: msgId }, 200, env)
}

// GET /api/admin/stats
async function handleAdminStats(request, env) {
  // Admin auth: timing-safe key check + optional IP allowlist
  const apiKey = getApiKey(request)
  if (!apiKey || !env.ADMIN_API_KEY || !(await timingSafeEqual(apiKey, env.ADMIN_API_KEY))) {
    return error('Unauthorized', 401, env)
  }
  // Optional IP restriction: set ADMIN_ALLOWED_IPS as comma-separated IPs
  if (env.ADMIN_ALLOWED_IPS) {
    const ip = request.headers.get('CF-Connecting-IP') || ''
    const allowed = env.ADMIN_ALLOWED_IPS.split(',').map(s => s.trim())
    if (!allowed.includes(ip)) {
      console.warn(`[SECURITY] Admin access denied for IP ${ip}`)
      return error('Forbidden', 403, env)
    }
  }

  // Count accounts by listing KV keys with prefix "account:"
  let totalAccounts = 0
  let cursor = null
  const plans = {}
  const recentSignups = []

  do {
    const list = await env.ACCOUNTS.list({ prefix: 'account:', limit: 1000, cursor })
    for (const key of list.keys) {
      totalAccounts++
      // Fetch account details for plan breakdown + recent signups
      try {
        const raw = await env.ACCOUNTS.get(key.name)
        if (raw) {
          const acct = JSON.parse(raw)
          plans[acct.plan || 'free'] = (plans[acct.plan || 'free'] || 0) + 1
          recentSignups.push({ id: acct.id, email: acct.email, plan: acct.plan, created_at: acct.created_at })
        }
      } catch { /* skip */ }
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)

  // Sort recent signups by date descending, keep last 10
  recentSignups.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const recent = recentSignups.slice(0, 10)

  // Count total mailboxes
  let totalMailboxes = 0
  let mbCursor = null
  do {
    const list = await env.MAILBOXES.list({ prefix: 'mailbox:', limit: 1000, cursor: mbCursor })
    totalMailboxes += list.keys.length
    mbCursor = list.list_complete ? null : list.cursor
  } while (mbCursor)

  // Fetch analytics for last 7 days
  const eventTypes = ['signup', 'email_sent', 'email_received', 'send_failure', 'auth_failure', 'auth_lockout', 'rate_limit_hit', 'oversized_request']
  const analytics = { today: {}, last_7_days: {} }
  const today = new Date().toISOString().slice(0, 10)

  for (const evt of eventTypes) {
    analytics.last_7_days[evt] = 0
  }

  for (let d = 0; d < 7; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
    for (const evt of eventTypes) {
      try {
        const val = parseInt(await env.RATE_LIMITS.get(`stats:${date}:${evt}`) || '0')
        analytics.last_7_days[evt] += val
        if (date === today) analytics.today[evt] = val
      } catch { /* skip */ }
    }
  }

  return json({
    total_accounts: totalAccounts,
    total_mailboxes: totalMailboxes,
    plans,
    recent_signups: recent,
    analytics,
  }, 200, env)
}

// GET /api/health
function handleHealth(env) {
  return json({ status: 'ok', service: 'AgentsMail API', version: VERSION, docs: 'https://agentsmail.net/docs' }, 200, env)
}

// ── Router ──

export default {
  // Handle inbound email from Cloudflare Email Routing
  async email(message, env, ctx) {
    const to = message.to.toLowerCase().trim()
    const from = message.from

    let rawText = ''
    try {
      const reader = message.raw.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        rawText += decoder.decode(value, { stream: true })
        if (rawText.length > 500000) break
      }
    } catch (e) {
      console.error('Failed to read raw email:', e)
      return
    }

    const parsed = parseRawEmail(rawText)

    const raw = await env.MAILBOXES.get(`mailbox:${to}`)
    if (!raw) {
      console.log(`Inbound email for unknown mailbox: ${to}`)
      return
    }

    const mailbox = JSON.parse(raw)
    const msgId = generateId(16)
    const threadId = deriveThreadId(parsed.messageId, parsed.inReplyTo, parsed.references)

    const emailMsg = {
      id: msgId,
      message_id_header: parsed.messageId || null,
      thread_id: threadId,
      in_reply_to: parsed.inReplyTo || null,
      references: parsed.references || null,
      from, to,
      subject: parsed.subject,
      body_plain: parsed.bodyPlain.slice(0, 100000),
      body_html: parsed.bodyHtml.slice(0, 100000),
      direction: 'inbound',
      labels: [],
      attachments: parsed.attachments || [],
      received_at: new Date().toISOString(),
    }

    mailbox.messages.unshift(emailMsg)

    const accountRaw = await env.ACCOUNTS.get(`account:${mailbox.account_id}`)
    const account = accountRaw ? JSON.parse(accountRaw) : null
    const maxMessages = account?.limits?.max_messages_per_mailbox || 100
    if (mailbox.messages.length > maxMessages) {
      mailbox.messages = mailbox.messages.slice(0, maxMessages)
    }

    await env.MAILBOXES.put(`mailbox:${to}`, JSON.stringify(mailbox))

    if (account) {
      fireWebhooks(account, 'email.received', {
        mailbox: to, id: msgId, from, subject: parsed.subject,
        thread_id: threadId,
        has_attachments: parsed.attachments.length > 0,
        preview: parsed.bodyPlain.slice(0, 300),
        received_at: emailMsg.received_at,
      }, ctx)
    }

    await trackEvent('email_received', env)
    console.log(`Email received: ${from} → ${to} | ${parsed.subject} | thread:${threadId} | ${parsed.attachments.length} attachments`)
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    // Reject oversized request bodies
    const contentLength = parseInt(request.headers.get('Content-Length') || '0')
    if (contentLength > MAX_BODY_SIZE) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      console.warn(`[SECURITY] Oversized request rejected: ${contentLength} bytes | IP: ${ip} | ${method} ${path}`)
      await trackEvent('oversized_request', env)
      return error('Request body too large (max 1MB)', 413, env)
    }

    if (path === '/api/health') return handleHealth(env)

    try {
      // Admin routes
      if (path === '/api/admin/stats' && method === 'GET') return handleAdminStats(request, env)

      // Auth routes
      if (path === '/api/signup' && method === 'POST') return handleSignup(request, env)
      if (path === '/api/account' && method === 'GET') return handleGetAccount(request, env)
      if (path === '/api/account/rotate-key' && method === 'POST') return handleRotateKey(request, env)
      if (path === '/api/account/verify' && (method === 'POST' || method === 'GET')) return handleVerifyAccount(request, env)

      // Webhook routes
      if (path === '/api/webhooks' && method === 'PUT') return handleSetWebhooks(request, env)

      // Inbound email webhook
      if (path === '/webhook/inbound' && method === 'POST') return handleInboundEmail(request, env, ctx)

      // Per-key rate limits on read/search endpoints
      const apiKeyForRL = getApiKey(request)
      if (apiKeyForRL && method === 'GET') {
        const keyHash = (await hashApiKey(apiKeyForRL)).slice(0, 12)
        const isSearch = path.endsWith('/search') || path === '/api/search'
        const rl = isSearch ? SEARCH_RATE_LIMIT : READ_RATE_LIMIT
        const rlKey = `rl:${isSearch ? 'search' : 'read'}:${keyHash}`
        const allowed = await checkRateLimit(rlKey, rl.limit, rl.windowSec, env)
        if (!allowed) {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
          console.warn(`[SECURITY] Rate limit hit: ${isSearch ? 'search' : 'read'} | IP: ${ip} | ${path}`)
          await trackEvent('rate_limit_hit', env)
          return error('Rate limit exceeded. Try again shortly.', 429, env)
        }
      }

      // Search across all mailboxes
      if (path === '/api/search' && method === 'GET') return handleSearchAll(request, env)

      // Mailbox CRUD
      if (path === '/api/mailboxes' && method === 'POST') return handleCreateMailbox(request, env, ctx)
      if (path === '/api/mailboxes' && method === 'GET') return handleListMailboxes(request, env)

      // /api/mailboxes/:address/messages/:id/attachments/:attachmentId
      const attachMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/messages\/([^/]+)\/attachments\/([^/]+)$/)
      if (attachMatch && method === 'GET') {
        return handleGetAttachment(request, env, decodeURIComponent(attachMatch[1]), attachMatch[2], attachMatch[3])
      }

      // /api/mailboxes/:address/messages/:id/labels
      const labelsMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/messages\/([^/]+)\/labels$/)
      if (labelsMatch && method === 'PUT') {
        return handleSetLabels(request, env, decodeURIComponent(labelsMatch[1]), labelsMatch[2])
      }

      // /api/mailboxes/:address/messages/:id
      const msgDetailMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/messages\/([^/]+)$/)
      if (msgDetailMatch) {
        const address = decodeURIComponent(msgDetailMatch[1])
        const messageId = msgDetailMatch[2]
        if (method === 'GET') return handleGetMessage(request, env, address, messageId)
        if (method === 'DELETE') return handleDeleteMessage(request, env, address, messageId)
      }

      // /api/mailboxes/:address/messages
      const msgListMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/messages$/)
      if (msgListMatch) {
        const address = decodeURIComponent(msgListMatch[1])
        if (method === 'GET') return handleListMessages(request, env, address)
      }

      // /api/mailboxes/:address/threads/:threadId
      const threadDetailMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/threads\/([^/]+)$/)
      if (threadDetailMatch) {
        return handleGetThread(request, env, decodeURIComponent(threadDetailMatch[1]), decodeURIComponent(threadDetailMatch[2]))
      }

      // /api/mailboxes/:address/threads
      const threadsMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/threads$/)
      if (threadsMatch && method === 'GET') {
        return handleListThreads(request, env, decodeURIComponent(threadsMatch[1]))
      }

      // /api/mailboxes/:address/search
      const searchMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/search$/)
      if (searchMatch && method === 'GET') {
        return handleSearchMailbox(request, env, decodeURIComponent(searchMatch[1]))
      }

      // /api/mailboxes/:address/send
      const sendMatch = path.match(/^\/api\/mailboxes\/([^/]+)\/send$/)
      if (sendMatch && method === 'POST') {
        return handleSendEmail(request, env, decodeURIComponent(sendMatch[1]), ctx)
      }

      // /api/mailboxes/:address
      const mailboxMatch = path.match(/^\/api\/mailboxes\/([^/]+)$/)
      if (mailboxMatch && method === 'DELETE') {
        return handleDeleteMailbox(request, env, decodeURIComponent(mailboxMatch[1]), ctx)
      }

      return error('Not found', 404, env)

    } catch (e) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      console.error(`[ERROR] Unhandled: ${e.message} | ${method} ${path} | IP: ${ip}`)
      return error('Internal server error', 500, env)
    }
  },
}