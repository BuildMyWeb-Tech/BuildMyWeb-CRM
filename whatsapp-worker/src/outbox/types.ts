export type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'

export interface OutboxJob {
  id: string
  account_id: string
  whatsapp_account_id: string
  conversation_id: string | null
  message_id: string | null
  recipient: string
  message_type: string
  payload: Record<string, unknown>
  status: OutboxStatus
  attempts: number
  max_attempts: number
  scheduled_at: string
  processed_at: string | null
  error: string | null
  idempotency_key: string
  locked_at: string | null
  locked_by: string | null
  created_at: string
  updated_at: string
}
