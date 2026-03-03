import { useState, useEffect } from 'react'
import {
  Mail, Send, Copy, Plus, Trash2, ArrowLeft, Check,
  Code, Globe, RefreshCw, Key, Terminal, ChevronRight,
  Search, Tag, MessageSquare, BookOpen, Paperclip, Github,
} from 'lucide-react'
import './App.css'

const API_BASE = 'https://api.agentsmail.net'

// ── Toast ──
function useToast() {
  const [msg, setMsg] = useState(null)
  const show = (text) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2000)
  }
  return [msg, show]
}

// ── Landing Page ──
function LandingPage({ onGetStarted, onViewDocs }) {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">Open Source</div>
        <h2>
          Email for<br />
          <span className="gradient">AI Agents</span>
        </h2>
        <p>
          Give your AI agents their own email addresses.
          Send, receive, search, and thread emails via a simple REST API.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onGetStarted}>
            <Terminal size={13} />
            Get API Key
          </button>
          <button className="btn btn-secondary" onClick={onViewDocs}>
            <BookOpen size={13} />
            API Docs
          </button>
        </div>
      </section>

      {/* Code Example */}
      <section className="code-section" id="code-example">
        <div className="code-block">
          <div className="code-label">Quick Start</div>
          <pre dangerouslySetInnerHTML={{ __html: `<span class="cm"># Sign up and get your first agent email</span>
<span class="fn">curl</span> <span class="str">-X POST</span> https://api.agentsmail.net/api/signup \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{"email": "you@co.com", "first_mailbox": "my-bot"}'</span>

<span class="cm"># → {"api_key": "am_...", "first_mailbox": "my-bot@agentsmail.net"}</span>

<span class="cm"># Send an email from your agent</span>
<span class="fn">curl</span> <span class="str">-X POST</span> https://api.agentsmail.net/api/mailboxes/my-bot@agentsmail.net/send \\
  -H <span class="str">"Authorization: Bearer am_your_api_key"</span> \\
  -d <span class="str">'{"to": "user@example.com", "subject": "Hello!", "text": "Hi from AI"}'</span>

<span class="cm"># Check inbox</span>
<span class="fn">curl</span> https://api.agentsmail.net/api/mailboxes/my-bot@agentsmail.net/messages \\
  -H <span class="str">"Authorization: Bearer am_your_api_key"</span>` }} />
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="section-title">Why AgentsMail</div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Mail size={16} /></div>
            <h4>Send & Receive</h4>
            <p>Full email capability for your agents. Send outbound emails and receive replies via API.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><MessageSquare size={16} /></div>
            <h4>Threading</h4>
            <p>Automatic conversation threading. Reply to emails and keep full context.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Paperclip size={16} /></div>
            <h4>Attachments</h4>
            <p>Send and receive file attachments. Full MIME parsing built in.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Search size={16} /></div>
            <h4>Search</h4>
            <p>Full-text search across all mailboxes. Find any email instantly.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Tag size={16} /></div>
            <h4>Labels & Tags</h4>
            <p>Organize messages with custom labels. Filter and categorize at scale.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Globe size={16} /></div>
            <h4>Webhooks</h4>
            <p>Real-time notifications with retries. Get notified when email arrives.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Code size={16} /></div>
            <h4>SDKs & MCP</h4>
            <p>Python, TypeScript SDKs. MCP server for Claude and AI agents.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Github size={16} /></div>
            <h4>Open Source</h4>
            <p>MIT licensed. Self-host on Cloudflare Workers free tier. Full control.</p>
          </div>
        </div>
      </section>

      {/* SDK Examples */}
      <section className="code-section">
        <div className="section-title">SDKs</div>
        <div className="sdk-grid">
          <div className="code-block">
            <div className="code-label">Python</div>
            <pre dangerouslySetInnerHTML={{ __html: `<span class="fn">from</span> agentsmail <span class="fn">import</span> AgentsMail

client = AgentsMail(<span class="str">"am_your_key"</span>)

<span class="cm"># Send email</span>
client.send_email(
    <span class="str">"bot@agentsmail.net"</span>,
    to=<span class="str">"user@example.com"</span>,
    subject=<span class="str">"Hello!"</span>,
    text=<span class="str">"From my AI agent"</span>
)

<span class="cm"># Search</span>
results = client.search(<span class="str">"invoice"</span>)` }} />
          </div>
          <div className="code-block">
            <div className="code-label">TypeScript</div>
            <pre dangerouslySetInnerHTML={{ __html: `<span class="fn">import</span> { AgentsMail } <span class="fn">from</span> <span class="str">'agentsmail'</span>

<span class="fn">const</span> client = <span class="fn">new</span> AgentsMail(<span class="str">'am_your_key'</span>)

<span class="cm">// Send email</span>
<span class="fn">await</span> client.sendEmail(
  <span class="str">'bot@agentsmail.net'</span>, {
    to: <span class="str">'user@example.com'</span>,
    subject: <span class="str">'Hello!'</span>,
    text: <span class="str">'From my AI agent'</span>,
})

<span class="cm">// Search</span>
<span class="fn">const</span> results = <span class="fn">await</span> client.search(<span class="str">'invoice'</span>)` }} />
          </div>
        </div>
      </section>
    </>
  )
}

// ── API Docs Page ──
function DocsPage() {
  const endpoints = [
    { cat: 'Account', items: [
      { method: 'POST', path: '/api/signup', desc: 'Create account', body: '{email, name?, first_mailbox?}' },
      { method: 'GET', path: '/api/account', desc: 'Get account info', body: '' },
    ]},
    { cat: 'Mailboxes', items: [
      { method: 'POST', path: '/api/mailboxes', desc: 'Create mailbox', body: '{name}' },
      { method: 'GET', path: '/api/mailboxes', desc: 'List mailboxes', body: '' },
      { method: 'DELETE', path: '/api/mailboxes/:address', desc: 'Delete mailbox', body: '' },
    ]},
    { cat: 'Messages', items: [
      { method: 'GET', path: '/api/mailboxes/:address/messages', desc: 'List messages', body: '?limit&offset&direction&label' },
      { method: 'GET', path: '/api/mailboxes/:address/messages/:id', desc: 'Get message', body: '' },
      { method: 'DELETE', path: '/api/mailboxes/:address/messages/:id', desc: 'Delete message', body: '' },
      { method: 'POST', path: '/api/mailboxes/:address/send', desc: 'Send email', body: '{to, subject, text?, html?, reply_to?, attachments?}' },
    ]},
    { cat: 'Labels', items: [
      { method: 'PUT', path: '/api/mailboxes/:address/messages/:id/labels', desc: 'Set labels', body: '{labels: [...]}' },
    ]},
    { cat: 'Threads', items: [
      { method: 'GET', path: '/api/mailboxes/:address/threads', desc: 'List threads', body: '' },
      { method: 'GET', path: '/api/mailboxes/:address/threads/:threadId', desc: 'Get thread', body: '' },
    ]},
    { cat: 'Search', items: [
      { method: 'GET', path: '/api/mailboxes/:address/search', desc: 'Search mailbox', body: '?q=query' },
      { method: 'GET', path: '/api/search', desc: 'Search all', body: '?q=query' },
    ]},
    { cat: 'Attachments', items: [
      { method: 'GET', path: '/api/mailboxes/:addr/messages/:id/attachments/:aid', desc: 'Get attachment', body: '' },
    ]},
    { cat: 'Webhooks', items: [
      { method: 'PUT', path: '/api/webhooks', desc: 'Set webhooks', body: '{webhooks: [{url, events?}]}' },
    ]},
  ]

  return (
    <section className="docs-page">
      <div className="section-title">API Reference</div>
      <p className="docs-intro">
        Base URL: <code>https://api.agentsmail.net</code><br />
        Auth: <code>Authorization: Bearer am_your_api_key</code>
      </p>

      {endpoints.map(cat => (
        <div key={cat.cat} className="docs-category">
          <h3 className="docs-cat-title">{cat.cat}</h3>
          {cat.items.map((ep, i) => (
            <div key={i} className="docs-endpoint">
              <span className={`docs-method ${ep.method.toLowerCase()}`}>{ep.method}</span>
              <code className="docs-path">{ep.path}</code>
              <span className="docs-desc">{ep.desc}</span>
              {ep.body && <code className="docs-body">{ep.body}</code>}
            </div>
          ))}
        </div>
      ))}

      <div className="docs-category">
        <h3 className="docs-cat-title">Webhook Events</h3>
        <div className="docs-events">
          <code>email.received</code> <code>email.sent</code> <code>mailbox.created</code> <code>mailbox.deleted</code>
        </div>
      </div>

      <div className="docs-category">
        <h3 className="docs-cat-title">SDKs & Tools</h3>
        <div className="docs-sdks">
          <div className="docs-sdk-item">
            <strong>Python:</strong> <code>pip install agentsmail</code>
          </div>
          <div className="docs-sdk-item">
            <strong>TypeScript:</strong> <code>npm install agentsmail</code>
          </div>
          <div className="docs-sdk-item">
            <strong>MCP Server:</strong> <code>npx agentsmail-mcp</code>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Auth Form ──
function AuthForm({ onAuth }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  const agentAddress = agentName.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')

  const handleStep1 = (e) => {
    e.preventDefault()
    if (!email) return setErr('Email is required')
    setErr('')
    setStep(2)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (!agentAddress) return setErr('Choose a name for your agent email')
    setLoading(true)
    setErr('')

    try {
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, first_mailbox: agentAddress }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Signup failed')
      setResult(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <section className="auth-section">
        <div className="auth-card">
          <div className="card">
            <div className="auth-title">You're All Set</div>
            <div className="success-block">
              <div className="success-item">
                <div className="label">Your Agent's Email</div>
                <div className="success-value highlight">{result.first_mailbox || `${agentAddress}@agentsmail.net`}</div>
              </div>
              <div className="success-item">
                <div className="label">Your API Key</div>
                <div className="success-value mono">{result.api_key}</div>
              </div>
              <div className="success-hint">
                Save your API key — you'll need it to send and receive emails.
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => onAuth(result.api_key, result.account_id)}>
                <Terminal size={13} />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="auth-section">
      <div className="auth-card">
        <div className="card">
          {step === 1 ? (
            <>
              <div className="auth-title">Get Started</div>
              <div className="auth-step">Step 1 of 2 — Your Info</div>
              <form onSubmit={handleStep1}>
                <div className="form-group">
                  <label className="label">Contact Email</label>
                  <input className="input" type="email" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                  <p className="form-hint">We'll send your API key here. This is NOT your agent's email.</p>
                </div>
                <div className="form-group">
                  <label className="label">Name / Company (optional)</label>
                  <input className="input" type="text" placeholder="Acme Corp"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                {err && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</p>}
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit">
                    Next: Choose Agent Email <ChevronRight size={13} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="auth-title">Choose Your Agent's Email</div>
              <div className="auth-step">Step 2 of 2 — Agent Address</div>
              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label className="label">Agent Email Name</label>
                  <div className="email-picker">
                    <input className="input email-picker-input" type="text" placeholder="my-agent"
                      value={agentName} onChange={e => setAgentName(e.target.value)} autoFocus />
                    <span className="email-picker-domain">@agentsmail.net</span>
                  </div>
                  <p className="form-hint">This will be your agent's email address. You can create more later.</p>
                  {agentAddress && (
                    <div className="email-preview">
                      <Mail size={14} />
                      <span>{agentAddress}@agentsmail.net</span>
                    </div>
                  )}
                </div>
                {err && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</p>}
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={loading || !agentAddress}>
                    {loading ? 'Creating...' : 'Create Account & Mailbox'}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => { setStep(1); setErr('') }}>
                    <ArrowLeft size={13} /> Back
                  </button>
                </div>
              </form>
            </>
          )}
          <div className="auth-toggle">
            Already have a key? <button onClick={() => {
              const key = prompt('Enter your API key:')
              if (key) onAuth(key)
            }}>Sign in</button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Dashboard ──
function Dashboard({ apiKey, onLogout, showToast }) {
  const [mailboxes, setMailboxes] = useState([])
  const [selectedMailbox, setSelectedMailbox] = useState(null)
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [compose, setCompose] = useState({ to: '', subject: '', text: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  const fetchMailboxes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mailboxes`, { headers })
      if (res.ok) {
        const data = await res.json()
        setMailboxes(data.mailboxes || [])
      }
    } catch (e) { console.error(e) }
  }

  const createMailbox = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/mailboxes`, {
        method: 'POST', headers, body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (res.ok) { showToast(`Mailbox created: ${data.address}`); setNewName(''); fetchMailboxes() }
      else showToast(data.error || 'Failed')
    } catch { showToast('Error creating mailbox') }
    finally { setLoading(false) }
  }

  const deleteMailbox = async (address) => {
    if (!confirm(`Delete ${address}?`)) return
    try {
      await fetch(`${API_BASE}/api/mailboxes/${encodeURIComponent(address)}`, { method: 'DELETE', headers })
      fetchMailboxes()
      if (selectedMailbox === address) setSelectedMailbox(null)
      showToast('Mailbox deleted')
    } catch { showToast('Error deleting') }
  }

  const fetchMessages = async (address) => {
    try {
      const res = await fetch(`${API_BASE}/api/mailboxes/${encodeURIComponent(address)}/messages`, { headers })
      if (res.ok) { const data = await res.json(); setMessages(data.messages || []) }
    } catch (e) { console.error(e) }
  }

  const fetchFullMessage = async (address, msgId) => {
    try {
      const res = await fetch(`${API_BASE}/api/mailboxes/${encodeURIComponent(address)}/messages/${msgId}`, { headers })
      if (res.ok) { const data = await res.json(); setSelectedMessage(data) }
    } catch (e) { console.error(e) }
  }

  const sendEmail = async () => {
    if (!compose.to || !compose.subject || !compose.text) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/mailboxes/${encodeURIComponent(selectedMailbox)}/send`, {
        method: 'POST', headers, body: JSON.stringify(compose),
      })
      const data = await res.json()
      if (res.ok) {
        showToast('Email sent!'); setCompose({ to: '', subject: '', text: '' })
        setShowCompose(false); fetchMessages(selectedMailbox)
      } else showToast(data.error || 'Send failed')
    } catch { showToast('Error sending') }
    finally { setLoading(false) }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      const q = encodeURIComponent(searchQuery.trim())
      const url = selectedMailbox
        ? `${API_BASE}/api/mailboxes/${encodeURIComponent(selectedMailbox)}/search?q=${q}`
        : `${API_BASE}/api/search?q=${q}`
      const res = await fetch(url, { headers })
      if (res.ok) { const data = await res.json(); setSearchResults(data.results || []) }
    } catch { showToast('Search failed') }
  }

  useEffect(() => { fetchMailboxes() }, [])

  useEffect(() => {
    if (selectedMailbox) {
      fetchMessages(selectedMailbox)
      setSelectedMessage(null)
      setSearchResults(null)
      setSearchQuery('')
      const iv = setInterval(() => fetchMessages(selectedMailbox), 10000)
      return () => clearInterval(iv)
    }
  }, [selectedMailbox])

  const copyKey = () => { navigator.clipboard.writeText(apiKey); showToast('API key copied') }

  // Message detail view
  if (selectedMessage) {
    return (
      <div className="dashboard">
        <button className="btn btn-secondary" onClick={() => setSelectedMessage(null)} style={{ marginBottom: 16 }}>
          <ArrowLeft size={13} /> Back to inbox
        </button>
        <div className="card message-detail">
          <div className="message-detail-header">
            <span className={`message-direction ${selectedMessage.direction}`}>{selectedMessage.direction}</span>
            {selectedMessage.labels && selectedMessage.labels.length > 0 && (
              <div className="message-labels">
                {selectedMessage.labels.map(l => <span key={l} className="label-tag">{l}</span>)}
              </div>
            )}
          </div>
          <h3 className="message-detail-subject">{selectedMessage.subject}</h3>
          <div className="message-detail-meta">
            <div>From: <strong>{selectedMessage.from}</strong></div>
            <div>To: <strong>{selectedMessage.to}</strong></div>
            <div>{new Date(selectedMessage.received_at).toLocaleString()}</div>
            {selectedMessage.thread_id && <div className="thread-id">Thread: {selectedMessage.thread_id}</div>}
          </div>
          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
            <div className="message-attachments">
              <Paperclip size={12} />
              {selectedMessage.attachments.map(a => (
                <span key={a.id} className="attachment-chip">{a.filename} ({Math.round(a.size / 1024)}KB)</span>
              ))}
            </div>
          )}
          <div className="message-detail-body">
            {selectedMessage.body_html
              ? <div dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }} />
              : <pre>{selectedMessage.body_plain}</pre>
            }
          </div>
        </div>
      </div>
    )
  }

  // Inbox view
  if (selectedMailbox) {
    const displayMessages = searchResults !== null ? searchResults : messages

    return (
      <div className="dashboard">
        <div className="inbox-header">
          <div>
            <button className="btn btn-secondary" onClick={() => { setSelectedMailbox(null); setShowCompose(false); setSearchResults(null) }} style={{ marginBottom: 12 }}>
              <ArrowLeft size={13} /> Back
            </button>
            <div className="inbox-address">{selectedMailbox}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => fetchMessages(selectedMailbox)}>
              <RefreshCw size={13} />
            </button>
            <button className="btn btn-primary" onClick={() => setShowCompose(!showCompose)}>
              <Send size={13} /> Compose
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="search-bar">
          <Search size={14} />
          <input className="search-input" placeholder="Search messages..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          {searchResults !== null && (
            <button className="search-clear" onClick={() => { setSearchResults(null); setSearchQuery('') }}>Clear</button>
          )}
        </div>

        {showCompose && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="label">Send Email</div>
            <div className="compose-form">
              <input className="input" placeholder="To: recipient@example.com" value={compose.to} onChange={e => setCompose({...compose, to: e.target.value})} />
              <input className="input" placeholder="Subject" value={compose.subject} onChange={e => setCompose({...compose, subject: e.target.value})} />
              <textarea className="input" placeholder="Message body..." rows={4} value={compose.text} onChange={e => setCompose({...compose, text: e.target.value})} style={{ resize: 'vertical', minHeight: 80 }} />
              <button className="btn btn-primary" onClick={sendEmail} disabled={loading}>
                <Send size={13} /> {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {searchResults !== null && (
          <div className="search-results-label">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</div>
        )}

        {displayMessages.length === 0 ? (
          <div className="empty-state">
            <h3>{searchResults !== null ? 'No results found' : 'No messages yet'}</h3>
            <p>{searchResults !== null ? 'Try a different search' : `Send an email to ${selectedMailbox} or compose one above`}</p>
          </div>
        ) : (
          displayMessages.map(msg => (
            <div key={msg.id} className="message-item" onClick={() => fetchFullMessage(selectedMailbox, msg.id)}>
              <div className="message-item-top">
                <span className={`message-direction ${msg.direction}`}>{msg.direction}</span>
                {msg.has_attachments && <Paperclip size={11} style={{ color: 'var(--text3)' }} />}
                {msg.thread_id && <MessageSquare size={11} style={{ color: 'var(--text3)' }} />}
                {msg.labels && msg.labels.length > 0 && (
                  <div className="message-labels-inline">
                    {msg.labels.slice(0, 3).map(l => <span key={l} className="label-tag-sm">{l}</span>)}
                  </div>
                )}
              </div>
              <div className="message-subject">{msg.subject}</div>
              <div className="message-from">{msg.direction === 'inbound' ? `From: ${msg.from}` : `To: ${msg.to}`}</div>
              <div className="message-preview">{msg.preview}</div>
              <div className="message-time">{new Date(msg.received_at).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    )
  }

  // Dashboard main
  return (
    <div className="dashboard">
      <div className="dash-section">
        <div className="label">Your API Key</div>
        <div className="api-key-display">
          <span className="api-key-value">{apiKey}</span>
          <button className="btn btn-secondary" onClick={copyKey} style={{ padding: '6px 12px' }}>
            <Copy size={12} />
          </button>
        </div>
      </div>

      {/* Global Search */}
      <div className="dash-section">
        <div className="label">Search All Mailboxes</div>
        <div className="search-bar">
          <Search size={14} />
          <input className="search-input" placeholder="Search across all emails..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        </div>
        {searchResults !== null && (
          <div style={{ marginTop: 12 }}>
            <div className="search-results-label">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              <button className="search-clear" onClick={() => { setSearchResults(null); setSearchQuery('') }}>Clear</button>
            </div>
            {searchResults.map(msg => (
              <div key={msg.id} className="message-item">
                <span className={`message-direction ${msg.direction}`}>{msg.direction}</span>
                {msg.mailbox && <span className="search-mailbox">{msg.mailbox}</span>}
                <div className="message-subject">{msg.subject}</div>
                <div className="message-from">{msg.from}</div>
                <div className="message-preview">{msg.preview}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-section">
        <div className="label">Create New Mailbox</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="input" placeholder="agent-name" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createMailbox()}
            style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={createMailbox} disabled={loading || !newName.trim()}>
            <Plus size={13} /> Create
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
          Address will be: {newName.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'agent-name'}@agentsmail.net
        </p>
      </div>

      <div className="dash-section">
        <div className="dash-header">
          <div className="label" style={{ margin: 0 }}>Your Mailboxes</div>
          <button className="btn btn-secondary" onClick={fetchMailboxes} style={{ padding: '4px 10px', fontSize: 10 }}>
            <RefreshCw size={11} />
          </button>
        </div>
        {mailboxes.length === 0 ? (
          <div className="empty-state">
            <h3>No mailboxes yet</h3>
            <p>Create your first agent mailbox above</p>
          </div>
        ) : (
          <div className="mailbox-list">
            {mailboxes.map(mb => (
              <div key={mb.address} className="mailbox-item" onClick={() => setSelectedMailbox(mb.address)}>
                <div className="mailbox-info">
                  <div className="mailbox-address">{mb.address}</div>
                  <div className="mailbox-meta">
                    <span>{mb.message_count} messages</span>
                    <span>Created {new Date(mb.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="mailbox-actions">
                  <button className="btn-danger" onClick={(e) => { e.stopPropagation(); deleteMailbox(mb.address) }}>
                    <Trash2 size={11} />
                  </button>
                  <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-secondary" onClick={onLogout} style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
        Sign Out
      </button>
    </div>
  )
}

// ── App ──
function App() {
  const [view, setView] = useState('landing') // landing | auth | dashboard | docs
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('am_api_key') || '')
  const [toastMsg, showToast] = useToast()

  useEffect(() => {
    if (apiKey) setView('dashboard')
  }, [])

  const handleAuth = (key) => {
    localStorage.setItem('am_api_key', key)
    setApiKey(key)
    setView('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('am_api_key')
    setApiKey('')
    setView('landing')
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="logo" onClick={() => setView(apiKey ? 'dashboard' : 'landing')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">AM</div>
            <h1>AGENTS<span>MAIL</span></h1>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setView('docs')} style={{ padding: '6px 14px', fontSize: 10 }}>
              <BookOpen size={12} /> Docs
            </button>
            {view === 'dashboard' ? (
              <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '6px 14px', fontSize: 10 }}>
                Sign Out
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setView('auth')} style={{ padding: '8px 16px' }}>
                <Key size={12} />
                Get API Key
              </button>
            )}
          </div>
        </header>

        {view === 'landing' && <LandingPage onGetStarted={() => setView('auth')} onViewDocs={() => setView('docs')} />}
        {view === 'auth' && <AuthForm onAuth={handleAuth} />}
        {view === 'dashboard' && <Dashboard apiKey={apiKey} onLogout={handleLogout} showToast={showToast} />}
        {view === 'docs' && <DocsPage />}

        <footer className="footer">
          <p>&copy; 2025 AgentsMail.net &mdash; Open source email for AI agents</p>
        </footer>
      </div>

      <div className={`toast ${toastMsg ? 'show' : ''}`}>
        <Check size={13} />
        {toastMsg}
      </div>
    </div>
  )
}

export default App
