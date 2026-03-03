import type {
  Account, Mailbox, MessageSummary, Message, Attachment,
  Thread, SendEmailOptions, SignupOptions, SignupResult, SearchResult,
} from './types'

export class AgentsMailError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'AgentsMailError'
    this.statusCode = statusCode
  }
}

export class AgentsMail {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://api.agentsmail.net') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`
    if (params) {
      const qs = new URLSearchParams(params).toString()
      if (qs) url += `?${qs}`
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await res.json() as any
    if (!res.ok) {
      throw new AgentsMailError(data.error || `HTTP ${res.status}`, res.status)
    }
    return data as T
  }

  private enc(s: string): string {
    return encodeURIComponent(s)
  }

  // ── Static: Signup ──

  static async signup(options: SignupOptions, baseUrl = 'https://api.agentsmail.net'): Promise<SignupResult> {
    const res = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
    const data = await res.json() as any
    if (!res.ok) throw new AgentsMailError(data.error || 'Signup failed', res.status)
    return data as SignupResult
  }

  // ── Account ──

  async getAccount(): Promise<Account> {
    return this.request('GET', '/api/account')
  }

  // ── Mailboxes ──

  async createMailbox(name: string): Promise<{ message: string; address: string; name: string }> {
    return this.request('POST', '/api/mailboxes', { name })
  }

  async listMailboxes(): Promise<Mailbox[]> {
    const data = await this.request<{ mailboxes: Mailbox[] }>('GET', '/api/mailboxes')
    return data.mailboxes
  }

  async deleteMailbox(address: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/mailboxes/${this.enc(address)}`)
  }

  // ── Messages ──

  async listMessages(address: string, options?: { limit?: number; offset?: number; direction?: string; label?: string }): Promise<{ messages: MessageSummary[]; total: number }> {
    const params: Record<string, string> = {}
    if (options?.limit) params.limit = String(options.limit)
    if (options?.offset) params.offset = String(options.offset)
    if (options?.direction) params.direction = options.direction
    if (options?.label) params.label = options.label
    return this.request('GET', `/api/mailboxes/${this.enc(address)}/messages`, undefined, params)
  }

  async getMessage(address: string, messageId: string): Promise<Message> {
    return this.request('GET', `/api/mailboxes/${this.enc(address)}/messages/${messageId}`)
  }

  async deleteMessage(address: string, messageId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/mailboxes/${this.enc(address)}/messages/${messageId}`)
  }

  // ── Send ──

  async sendEmail(fromAddress: string, options: SendEmailOptions): Promise<{ message: string; id: string; thread_id: string }> {
    return this.request('POST', `/api/mailboxes/${this.enc(fromAddress)}/send`, options)
  }

  // ── Labels ──

  async setLabels(address: string, messageId: string, labels: string[]): Promise<{ labels: string[] }> {
    return this.request('PUT', `/api/mailboxes/${this.enc(address)}/messages/${messageId}/labels`, { labels })
  }

  // ── Threads ──

  async listThreads(address: string): Promise<Thread[]> {
    const data = await this.request<{ threads: Thread[] }>('GET', `/api/mailboxes/${this.enc(address)}/threads`)
    return data.threads
  }

  async getThread(address: string, threadId: string): Promise<{ messages: Message[] }> {
    return this.request('GET', `/api/mailboxes/${this.enc(address)}/threads/${this.enc(threadId)}`)
  }

  // ── Search ──

  async search(query: string, limit = 20): Promise<SearchResult[]> {
    const data = await this.request<{ results: SearchResult[] }>('GET', '/api/search', undefined, { q: query, limit: String(limit) })
    return data.results
  }

  async searchMailbox(address: string, query: string, limit = 20): Promise<SearchResult[]> {
    const data = await this.request<{ results: SearchResult[] }>('GET', `/api/mailboxes/${this.enc(address)}/search`, undefined, { q: query, limit: String(limit) })
    return data.results
  }

  // ── Attachments ──

  async getAttachment(address: string, messageId: string, attachmentId: string): Promise<Attachment> {
    return this.request('GET', `/api/mailboxes/${this.enc(address)}/messages/${messageId}/attachments/${attachmentId}`)
  }

  // ── Webhooks ──

  async setWebhook(url: string): Promise<{ message: string }> {
    return this.request('PUT', '/api/webhooks', { url })
  }

  async setWebhooks(webhooks: Array<{ url: string; events?: string[] }>): Promise<{ webhooks: Array<{ id: string; url: string; events: string[] }> }> {
    return this.request('PUT', '/api/webhooks', { webhooks })
  }

  // ── Health ──

  async health(): Promise<{ status: string; version: string }> {
    return this.request('GET', '/api/health')
  }
}
