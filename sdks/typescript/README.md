# AgentsMail TypeScript SDK

Email for AI Agents. Send, receive, search, and thread emails via a typed TypeScript API.

## Install

```bash
npm install agentsmail
```

## Quick Start

```typescript
import { AgentsMail } from 'agentsmail'

const client = new AgentsMail('am_your_api_key')

// Create a mailbox
const mailbox = await client.createMailbox('support-bot')
console.log(mailbox.address) // support-bot@agentsmail.net

// Send an email
await client.sendEmail('support-bot@agentsmail.net', {
  to: 'user@example.com',
  subject: 'Hello from my AI agent!',
  text: 'This email was sent by an AI agent.',
})

// Check inbox
const { messages } = await client.listMessages('support-bot@agentsmail.net')
messages.forEach(msg => console.log(`${msg.from}: ${msg.subject}`))

// Search
const results = await client.search('invoice')
```

## Sign Up

```typescript
const data = await AgentsMail.signup({
  email: 'you@company.com',
  name: 'Acme Corp',
  first_mailbox: 'acme-bot',
})
console.log(data.api_key)       // am_...
console.log(data.first_mailbox) // acme-bot@agentsmail.net
```

## Docs

Full API reference: [agentsmail.net](https://agentsmail.net)

## License

MIT
