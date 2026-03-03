"""AgentsMail Python SDK — Email for AI Agents"""

from typing import Optional
import requests


class AgentsMailError(Exception):
    """Raised when the AgentsMail API returns an error."""
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class AgentsMail:
    """Client for the AgentsMail API.

    Usage:
        client = AgentsMail("am_your_api_key")
        mailbox = client.create_mailbox("my-bot")
        client.send_email(mailbox["address"], to="user@example.com", subject="Hi", text="Hello!")
        messages = client.list_messages(mailbox["address"])
    """

    def __init__(self, api_key: str, base_url: str = "https://api.agentsmail.net"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self.base_url}{path}"
        res = self._session.request(method, url, **kwargs)
        data = res.json()
        if not res.ok:
            raise AgentsMailError(data.get("error", f"HTTP {res.status_code}"), res.status_code)
        return data

    # ── Account ──

    @staticmethod
    def signup(email: str, name: str = "", first_mailbox: str = "", base_url: str = "https://api.agentsmail.net") -> dict:
        """Create a new account. Returns dict with api_key, account_id, first_mailbox."""
        body = {"email": email, "name": name}
        if first_mailbox:
            body["first_mailbox"] = first_mailbox
        res = requests.post(f"{base_url}/api/signup", json=body)
        data = res.json()
        if not res.ok:
            raise AgentsMailError(data.get("error", "Signup failed"), res.status_code)
        return data

    def get_account(self) -> dict:
        """Get current account info."""
        return self._request("GET", "/api/account")

    # ── Mailboxes ──

    def create_mailbox(self, name: str) -> dict:
        """Create a new agent mailbox. Returns dict with address, name."""
        return self._request("POST", "/api/mailboxes", json={"name": name})

    def list_mailboxes(self) -> list:
        """List all mailboxes. Returns list of mailbox dicts."""
        return self._request("GET", "/api/mailboxes")["mailboxes"]

    def delete_mailbox(self, address: str) -> dict:
        """Delete a mailbox."""
        return self._request("DELETE", f"/api/mailboxes/{requests.utils.quote(address, safe='')}")

    # ── Messages ──

    def list_messages(self, address: str, limit: int = 50, offset: int = 0,
                      direction: Optional[str] = None, label: Optional[str] = None) -> dict:
        """List messages in a mailbox. Returns dict with messages, total, limit, offset."""
        params = {"limit": limit, "offset": offset}
        if direction:
            params["direction"] = direction
        if label:
            params["label"] = label
        return self._request("GET", f"/api/mailboxes/{requests.utils.quote(address, safe='')}/messages", params=params)

    def get_message(self, address: str, message_id: str) -> dict:
        """Get a single message with full body."""
        return self._request("GET", f"/api/mailboxes/{requests.utils.quote(address, safe='')}/messages/{message_id}")

    def delete_message(self, address: str, message_id: str) -> dict:
        """Delete a message."""
        return self._request("DELETE", f"/api/mailboxes/{requests.utils.quote(address, safe='')}/messages/{message_id}")

    # ── Send ──

    def send_email(self, from_address: str, *, to: str, subject: str,
                   text: str = "", html: str = "", reply_to: str = "",
                   attachments: Optional[list] = None) -> dict:
        """Send an email from an agent mailbox. Returns dict with id, thread_id."""
        body = {"to": to, "subject": subject}
        if text:
            body["text"] = text
        if html:
            body["html"] = html
        if reply_to:
            body["reply_to"] = reply_to
        if attachments:
            body["attachments"] = attachments
        return self._request("POST", f"/api/mailboxes/{requests.utils.quote(from_address, safe='')}/send", json=body)

    # ── Labels ──

    def set_labels(self, address: str, message_id: str, labels: list) -> dict:
        """Set labels on a message."""
        return self._request("PUT",
            f"/api/mailboxes/{requests.utils.quote(address, safe='')}/messages/{message_id}/labels",
            json={"labels": labels})

    # ── Threads ──

    def list_threads(self, address: str) -> list:
        """List conversation threads in a mailbox."""
        return self._request("GET", f"/api/mailboxes/{requests.utils.quote(address, safe='')}/threads")["threads"]

    def get_thread(self, address: str, thread_id: str) -> dict:
        """Get all messages in a thread."""
        return self._request("GET",
            f"/api/mailboxes/{requests.utils.quote(address, safe='')}/threads/{requests.utils.quote(thread_id, safe='')}")

    # ── Search ──

    def search(self, query: str, limit: int = 20) -> list:
        """Search across all mailboxes."""
        return self._request("GET", "/api/search", params={"q": query, "limit": limit})["results"]

    def search_mailbox(self, address: str, query: str, limit: int = 20) -> list:
        """Search within a specific mailbox."""
        return self._request("GET",
            f"/api/mailboxes/{requests.utils.quote(address, safe='')}/search",
            params={"q": query, "limit": limit})["results"]

    # ── Attachments ──

    def get_attachment(self, address: str, message_id: str, attachment_id: str) -> dict:
        """Get attachment content (base64 encoded)."""
        return self._request("GET",
            f"/api/mailboxes/{requests.utils.quote(address, safe='')}/messages/{message_id}/attachments/{attachment_id}")

    # ── Webhooks ──

    def set_webhook(self, url: str) -> dict:
        """Set a single webhook URL (legacy)."""
        return self._request("PUT", "/api/webhooks", json={"url": url})

    def set_webhooks(self, webhooks: list) -> dict:
        """Set multiple webhooks. Each: {url: str, events: [str]}."""
        return self._request("PUT", "/api/webhooks", json={"webhooks": webhooks})

    # ── Health ──

    def health(self) -> dict:
        """Check API health."""
        return self._request("GET", "/api/health")
