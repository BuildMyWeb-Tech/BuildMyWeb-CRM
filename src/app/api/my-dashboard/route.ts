import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/my-dashboard?user_id= — aggregated personal dashboard data for one team member.
// Defaults to the logged-in user when user_id is omitted.

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('user_id') || ctx.userId
    if (!targetUserId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // All project tasks for the account (My Work shows everything relevant to the user)
    const { data: tasks } = await ctx.supabase
      .from('project_tasks')
      .select('id, title, priority, due_date, project_id, assignee_user_id, assignee_user_ids, project:projects(id, name, client_id, client:clients(id, name)), stage:pipeline_stages(name)')
      .eq('account_id', ctx.accountId)
      .order('due_date', { ascending: true, nullsFirst: false })

    // Enquiry tasks assigned to targetUserId
    const { data: enquiryTasks } = await ctx.supabase
      .from('enquiry_tasks')
      .select('id, title, status, priority, due_date, client_lead:client_leads(id, title)')
      .eq('account_id', ctx.accountId)
      .contains('assigned_user_ids', [targetUserId])
      .neq('status', 'done')
      .order('due_date', { ascending: true })

    // Follow-ups assigned to targetUserId (client leads)
    const { data: followUps } = await ctx.supabase
      .from('client_leads')
      .select('id, title, next_follow_up_at, status, priority')
      .eq('account_id', ctx.accountId)
      .eq('allocated_user_id', targetUserId)
      .not('next_follow_up_at', 'is', null)
      .lte('next_follow_up_at', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('next_follow_up_at', { ascending: true })
      .limit(20)

    // Projects owned by or assigned to user
    const { data: projects } = await ctx.supabase
      .from('projects')
      .select('id, name, status, progress_percentage, due_date, client:clients(id, name)')
      .eq('account_id', ctx.accountId)
      .eq('owner_user_id', targetUserId)
      .not('status', 'eq', 'done')
      .order('due_date', { ascending: true })
      .limit(10)

    // Enquiry pipeline counts
    const { data: enquiries } = await ctx.supabase
      .from('client_leads')
      .select('id, status')
      .eq('account_id', ctx.accountId)

    // Revenue for this month
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data: payments } = await ctx.supabase
      .from('client_payments')
      .select('amount')
      .eq('account_id', ctx.accountId)
      .eq('status', 'paid')
      .gte('received_date', monthStart)

    // Unread DMs — table may not exist yet; treat error as 0
    let unreadDMs = 0
    try {
      const { count } = await ctx.supabase
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', ctx.accountId)
        .eq('recipient_id', targetUserId)
        .is('read_at', null)
      unreadDMs = count ?? 0
    } catch { /* table not yet migrated */ }

    // Unread project chat messages
    const { count: unreadChats } = await ctx.supabase
      .from('project_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
      .neq('sender_user_id', targetUserId)
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())

    // Recent activity
    const { data: activity } = await ctx.supabase
      .from('activity_logs')
      .select('id, action, entity_type, entity_name, created_at, user:profiles(full_name)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(10)

    const allTasks = (tasks ?? []).filter((t) => {
      // Exclude done-stage tasks
      const stageName = (t as { stage?: { name?: string } }).stage?.name?.toLowerCase()
      return stageName !== 'done'
    })
    const allEnquiryTasks = enquiryTasks ?? []

    const overdueTasks = allTasks.filter((t) => t.due_date && t.due_date < todayStr)
    const dueTodayTasks = allTasks.filter((t) => t.due_date === todayStr)
    const upcomingTasks = allTasks.filter((t) => t.due_date && t.due_date > todayStr)
    const waitingTasks = allTasks.filter((t) => !t.due_date)

    const enquiryStatusCounts: Record<string, number> = {}
    for (const e of enquiries ?? []) {
      enquiryStatusCounts[e.status] = (enquiryStatusCounts[e.status] ?? 0) + 1
    }

    const monthRevenue = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)

    return NextResponse.json({
      stats: {
        task_count: allTasks.length + allEnquiryTasks.length,
        followup_count: (followUps ?? []).length,
        enquiry_count: (enquiries ?? []).length,
        project_count: (projects ?? []).length,
        month_revenue: monthRevenue,
        unread_messages: unreadDMs + (unreadChats ?? 0),
      },
      my_work: {
        overdue: overdueTasks,
        due_today: dueTodayTasks,
        upcoming: upcomingTasks,
        waiting: waitingTasks,
      },
      followups: followUps ?? [],
      project_health: projects ?? [],
      enquiry_pipeline: enquiryStatusCounts,
      unread_dm_count: unreadDMs ?? 0,
      recent_activity: activity ?? [],
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
