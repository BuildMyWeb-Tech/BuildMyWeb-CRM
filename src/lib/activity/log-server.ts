import { supabaseAdmin } from '@/lib/automations/admin-client'

/** Server-side counterpart to src/lib/activity/log.ts's logActivity —
 *  used from API routes (service-role client, no RLS check needed
 *  since the route itself already authorized the action). */
export async function logServerActivity(entry: {
  accountId: string
  userId: string | null
  action: 'create' | 'update' | 'delete'
  entityType: string
  entityId?: string
  description: string
}) {
  try {
    await supabaseAdmin().from('activity_logs').insert({
      account_id: entry.accountId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      description: entry.description,
    })
  } catch (err) {
    console.error('[activity-log] server write failed:', err)
  }
}
