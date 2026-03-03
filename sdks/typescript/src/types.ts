export interface Account {
  id: string
  email: string
  name: string
  mailboxes: string[]
  webhooks: Webhook[]
  plan: string
  limits: PlanLimits
  created_at: string
}

export interface PlanLimits {
  max_mailboxes: number
  max_messages_per_mailbox: number
  max_sends_per_day: number
  max_webhooks: number
}

export interface Mailbox {
  address: string
  name: string
  message_count: number
  created_at: string
}

export interface MessageSummary {
  id: string
  from: string
  to: string
  subject: string
  preview: string
  direction: 'inbound' | 'outbound'
  labels: string[]
  thread_id: string | null
  has_attachments: boolean
  received_at: string
}

export interface Message {
  id: string
  message_id_header: string | null
  thread_id: string | null
  in_reply_to: string | null
  references: string | null
  from: string
  to: string
  subject: string
  body_plain: string
  body_html: string
  direction: 'inbound' | 'outbound'
  labels: string[]
  attachments: AttachmentMeta[]
  received_at: string
}

export interface AttachmentMeta {
  id: string
  filename: string
  content_type: string
  size: number
}

export interface Attachment extends AttachmentMeta {
  content_base64: string
}

export interface Thread {
  thread_id: string
  subject: string
  message_count: number
  last_activity: string
  messages: Array<{
    id: string
    from: string
    to: string
    direction: string
    preview: string
    received_at: string
  }>
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  created_at: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
  reply_to?: string
  attachments?: Array<{
    filename: string
    content_type?: string
    content_base64: string
  }>
}

export interface SignupOptions {
  email: string
  name?: string
  first_mailbox?: string
}

export interface SignupResult {
  message: string
  account_id: string
  api_key: string
  email: string
  plan: string
  limits: PlanLimits
  first_mailbox?: string
}

export interface SearchResult {
  mailbox?: string
  id: string
  from: string
  to: string
  subject: string
  preview: string
  direction: string
  labels: string[]
  thread_id: string | null
  received_at: string
}
