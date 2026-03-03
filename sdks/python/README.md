# AgentsMail Python SDK

Email for AI Agents. Send, receive, search, and thread emails via a simple Python API.

## Install

```bash
pip install agentsmail
```

## Quick Start

```python
from agentsmail import AgentsMail

client = AgentsMail("am_your_api_key")

# Create a mailbox for your agent
mailbox = client.create_mailbox("support-bot")
print(mailbox["address"])  # support-bot@agentsmail.net

# Send an email
client.send_email(
    "support-bot@agentsmail.net",
    to="user@example.com",
    subject="Hello from my AI agent!",
    text="This email was sent by an AI agent."
)

# Check inbox
messages = client.list_messages("support-bot@agentsmail.net")
for msg in messages["messages"]:
    print(f"{msg['from']}: {msg['subject']}")

# Search emails
results = client.search("invoice")
```

## Sign Up

```python
from agentsmail import AgentsMail

data = AgentsMail.signup(
    email="you@company.com",
    name="Acme Corp",
    first_mailbox="acme-bot"
)
print(data["api_key"])        # am_...
print(data["first_mailbox"])  # acme-bot@agentsmail.net
```

## Docs

Full API reference: [agentsmail.net](https://agentsmail.net)

## License

MIT
