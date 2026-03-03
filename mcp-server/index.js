#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = process.env.AGENTSMAIL_API_URL || 'https://api.agentsmail.net'
const API_KEY = process.env.AGENTSMAIL_API_KEY

if (!API_KEY) {
  console.error('Error: AGENTSMAIL_API_KEY environment variable is required')
  process.exit(1)
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`)
  return data
}

const server = new McpServer({
  name: 'agentsmail',
  version: '2.0.0',
})

// ── Tools ──

server.tool(
  'list_mailboxes',
  'List all your agent email mailboxes',
  {},
  async () => {
    const data = await api('/api/mailboxes')
    return { content: [{ type: 'text', text: JSON.stringify(data.mailboxes, null, 2) }] }
  }
)

server.tool(
  'create_mailbox',
  'Create a new agent email mailbox (e.g. "support-bot" creates support-bot@agentsmail.net)',
  { name: z.string().describe('Name for the mailbox (e.g. "support-bot", "sales-agent")') },
  async ({ name }) => {
    const data = await api('/api/mailboxes', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    return { content: [{ type: 'text', text: `Mailbox created: ${data.address}` }] }
  }
)

server.tool(
  'list_messages',
  'List messages in an agent mailbox inbox. Returns subject, from, preview, direction, and timestamps.',
  {
    address: z.string().describe('Email address of the mailbox (e.g. "my-bot@agentsmail.net")'),
    limit: z.number().optional().describe('Max messages to return (default 20, max 200)'),
    direction: z.enum(['inbound', 'outbound']).optional().describe('Filter by direction'),
    label: z.string().optional().describe('Filter by label'),
  },
  async ({ address, limit, direction, label }) => {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (direction) params.set('direction', direction)
    if (label) params.set('label', label)
    const qs = params.toString() ? `?${params}` : ''
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/messages${qs}`)
    return { content: [{ type: 'text', text: JSON.stringify(data.messages, null, 2) }] }
  }
)

server.tool(
  'get_message',
  'Get the full content of a specific email message including body, headers, and attachment info',
  {
    address: z.string().describe('Mailbox email address'),
    message_id: z.string().describe('Message ID'),
  },
  async ({ address, message_id }) => {
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/messages/${message_id}`)
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }
)

server.tool(
  'send_email',
  'Send an email from an agent mailbox. Can send new emails or reply to existing threads.',
  {
    from_address: z.string().describe('Mailbox to send from (e.g. "my-bot@agentsmail.net")'),
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    text: z.string().describe('Plain text body of the email'),
    html: z.string().optional().describe('HTML body (optional)'),
    reply_to: z.string().optional().describe('Message ID to reply to (for threading)'),
  },
  async ({ from_address, to, subject, text, html, reply_to }) => {
    const body = { to, subject, text }
    if (html) body.html = html
    if (reply_to) body.reply_to = reply_to
    const data = await api(`/api/mailboxes/${encodeURIComponent(from_address)}/send`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { content: [{ type: 'text', text: `Email sent! ID: ${data.id}, Thread: ${data.thread_id}` }] }
  }
)

server.tool(
  'search_emails',
  'Search for emails across all mailboxes by keyword. Searches subject, sender, recipient, and body.',
  {
    query: z.string().describe('Search query (searches subject, from, to, body)'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ query, limit }) => {
    const params = new URLSearchParams({ q: query })
    if (limit) params.set('limit', String(limit))
    const data = await api(`/api/search?${params}`)
    return { content: [{ type: 'text', text: JSON.stringify(data.results, null, 2) }] }
  }
)

server.tool(
  'search_mailbox',
  'Search for emails within a specific mailbox by keyword',
  {
    address: z.string().describe('Mailbox to search in'),
    query: z.string().describe('Search query'),
  },
  async ({ address, query }) => {
    const params = new URLSearchParams({ q: query })
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/search?${params}`)
    return { content: [{ type: 'text', text: JSON.stringify(data.results, null, 2) }] }
  }
)

server.tool(
  'set_labels',
  'Set labels/tags on a message for organization (e.g. "urgent", "processed", "needs-reply")',
  {
    address: z.string().describe('Mailbox email address'),
    message_id: z.string().describe('Message ID'),
    labels: z.array(z.string()).describe('Array of label strings to set on the message'),
  },
  async ({ address, message_id, labels }) => {
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/messages/${message_id}/labels`, {
      method: 'PUT',
      body: JSON.stringify({ labels }),
    })
    return { content: [{ type: 'text', text: `Labels updated: ${data.labels.join(', ')}` }] }
  }
)

server.tool(
  'list_threads',
  'List email conversation threads in a mailbox, grouped by thread ID',
  {
    address: z.string().describe('Mailbox email address'),
  },
  async ({ address }) => {
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/threads`)
    return { content: [{ type: 'text', text: JSON.stringify(data.threads, null, 2) }] }
  }
)

server.tool(
  'get_thread',
  'Get all messages in a conversation thread, ordered chronologically',
  {
    address: z.string().describe('Mailbox email address'),
    thread_id: z.string().describe('Thread ID'),
  },
  async ({ address, thread_id }) => {
    const data = await api(`/api/mailboxes/${encodeURIComponent(address)}/threads/${encodeURIComponent(thread_id)}`)
    return { content: [{ type: 'text', text: JSON.stringify(data.messages, null, 2) }] }
  }
)

server.tool(
  'delete_message',
  'Delete a message from a mailbox',
  {
    address: z.string().describe('Mailbox email address'),
    message_id: z.string().describe('Message ID to delete'),
  },
  async ({ address, message_id }) => {
    await api(`/api/mailboxes/${encodeURIComponent(address)}/messages/${message_id}`, { method: 'DELETE' })
    return { content: [{ type: 'text', text: 'Message deleted' }] }
  }
)

// ── Start server ──

const transport = new StdioServerTransport()
await server.connect(transport)
