# AgentsMail

**Open-source email infrastructure for AI agents.**

Send, receive, search, and thread emails via REST API. Built on Cloudflare's edge network.

[agentsmail.net](https://agentsmail.net) | [API Docs](#api-reference) | [Python SDK](sdks/python/) | [TypeScript SDK](sdks/typescript/) | [MCP Server](mcp-server/)

---

## Features

- **Send & Receive** — Full email for your agents via REST API
- **Threading** — Automatic conversation threading with Message-ID tracking
- **Attachments** — Send and receive file attachments
- **Labels & Tags** — Organize messages with custom labels
- **Search** — Full-text search across mailboxes
- **Webhooks** — Real-time notifications with retries and event filtering
- **Multi-Agent** — Each agent gets its own email address and isolated inbox
- **Python SDK** — `pip install agentsmail`
- **TypeScript SDK** — `npm install agentsmail`
- **MCP Server** — Plug into Claude and other AI agents directly
- **Open Source** — Self-host on Cloudflare Workers (free tier)

---

## Quick Start

### 1. Sign up and get your API key

```bash
curl -X POST https://api.agentsmail.net/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "you@company.com", "first_mailbox": "my-bot"}'

# → {"api_key": "am_...", "first_mailbox": "my-bot@agentsmail.net"}
```

### 2. Send an email

```bash
curl -X POST https://api.agentsmail.net/api/mailboxes/my-bot@agentsmail.net/send \
  -H "Authorization: Bearer am_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"to": "user@example.com", "subject": "Hello!", "text": "Sent by an AI agent"}'
```

### 3. Check inbox

```bash
curl https://api.agentsmail.net/api/mailboxes/my-bot@agentsmail.net/messages \
  -H "Authorization: Bearer am_your_api_key"
```

### 4. Search emails

```bash
curl "https://api.agentsmail.net/api/search?q=invoice" \
  -H "Authorization: Bearer am_your_api_key"
```

---

## SDKs

### Python

```bash
pip install agentsmail
```

```python
from agentsmail import AgentsMail

client = AgentsMail("am_your_api_key")
client.send_email("my-bot@agentsmail.net",
    to="user@example.com",
    subject="Hello!",
    text="Sent from Python"
)
messages = client.list_messages("my-bot@agentsmail.net")
```

### TypeScript

```bash
npm install agentsmail
```

```typescript
import { AgentsMail } from 'agentsmail'

const client = new AgentsMail('am_your_api_key')
await client.sendEmail('my-bot@agentsmail.net', {
  to: 'user@example.com',
  subject: 'Hello!',
  text: 'Sent from TypeScript',
})
const { messages } = await client.listMessages('my-bot@agentsmail.net')
```

---

## MCP Server (for Claude & AI Agents)

Give Claude direct access to email:

```bash
# Set your API key
export AGENTSMAIL_API_KEY=am_your_api_key

# Run the MCP server
npx agentsmail-mcp
```

Add to Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agentsmail": {
      "command": "npx",
      "args": ["agentsmail-mcp"],
      "env": {
        "AGENTSMAIL_API_KEY": "am_your_api_key"
      }
    }
  }
}
```

Claude can then send emails, check inboxes, search messages, and manage threads.

---

## API Reference

All endpoints require `Authorization: Bearer <api_key>` header (except signup and health).

### Account
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signup` | Create account `{email, name?, first_mailbox?}` |
| GET | `/api/account` | Get account info |

### Mailboxes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mailboxes` | Create mailbox `{name}` |
| GET | `/api/mailboxes` | List all mailboxes |
| DELETE | `/api/mailboxes/:address` | Delete mailbox |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mailboxes/:address/messages` | List messages `?limit&offset&direction&label` |
| GET | `/api/mailboxes/:address/messages/:id` | Get single message |
| DELETE | `/api/mailboxes/:address/messages/:id` | Delete message |
| POST | `/api/mailboxes/:address/send` | Send email `{to, subject, text?, html?, reply_to?, attachments?}` |

### Labels
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/mailboxes/:address/messages/:id/labels` | Set labels `{labels: [...]}` |

### Threads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mailboxes/:address/threads` | List conversation threads |
| GET | `/api/mailboxes/:address/threads/:threadId` | Get thread messages |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mailboxes/:address/search?q=query` | Search within mailbox |
| GET | `/api/search?q=query` | Search across all mailboxes |

### Attachments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mailboxes/:address/messages/:id/attachments/:attachmentId` | Get attachment (base64) |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/webhooks` | Set webhooks `{webhooks: [{url, events?}]}` |

Events: `email.received`, `email.sent`, `mailbox.created`, `mailbox.deleted`

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

---

## Self-Hosting

AgentsMail runs on Cloudflare's free tier:

### Architecture
- **Cloudflare Workers** — API + email handler (edge computing, 0ms cold start)
- **Cloudflare KV** — Message storage (key-value at the edge)
- **Cloudflare Email Routing** — Inbound email → Worker
- **Mailgun** — Outbound email delivery

### Deploy

```bash
# Clone
git clone https://github.com/agentsmail/agentsmail.git
cd agentsmail

# Install wrangler
npm install

# Create KV namespaces
wrangler kv namespace create ACCOUNTS
wrangler kv namespace create MAILBOXES
wrangler kv namespace create RATE_LIMITS

# Update wrangler.toml with your KV namespace IDs

# Set Mailgun API key
wrangler secret put MAILGUN_API_KEY

# Deploy
wrangler deploy

# Deploy frontend
cd frontend && npm install && npm run build
wrangler pages deploy dist --project-name=agentsmail
```

### DNS Setup
1. Add your domain to Cloudflare
2. Enable Email Routing (Catch-All → Worker)
3. Add CNAME for `api.yourdomain.com` → your Worker
4. Configure Mailgun for outbound sending

---

## Contributing

Contributions welcome! Please open an issue or PR.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

---

## License

MIT — see [LICENSE](LICENSE)

---

Built with Cloudflare Workers. Open source at [github.com/agentsmail/agentsmail](https://github.com/agentsmail/agentsmail).
