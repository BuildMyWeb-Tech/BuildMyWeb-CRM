import { NextResponse } from 'next/server'
import { getCurrentAccount } from '@/lib/auth/account'

export interface SearchResult {
  id: string
  type: 'client' | 'enquiry' | 'project' | 'project_task' | 'product' | 'product_task' | 'contact' | 'file'
  title: string
  subtitle?: string
  url: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: {} })

  let ctx: Awaited<ReturnType<typeof getCurrentAccount>>
  try {
    ctx = await getCurrentAccount()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, accountId } = ctx
  const like = `%${q}%`
  const MAX = 5

  const [
    clientsRes,
    enquiriesRes,
    projectsRes,
    tasksRes,
    productsRes,
    productTasksRes,
    contactsRes,
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, status')
      .eq('account_id', accountId)
      .or(`name.ilike.${like}`)
      .limit(MAX),

    supabase
      .from('client_leads')
      .select('id, title, phone, status')
      .eq('account_id', accountId)
      .or(`title.ilike.${like},phone.ilike.${like}`)
      .limit(MAX),

    supabase
      .from('projects')
      .select('id, name, status')
      .eq('account_id', accountId)
      .ilike('name', like)
      .limit(MAX),

    supabase
      .from('project_tasks')
      .select('id, title, project_id')
      .eq('account_id', accountId)
      .ilike('title', like)
      .limit(MAX),

    supabase
      .from('products')
      .select('id, project_name')
      .eq('account_id', accountId)
      .ilike('project_name', like)
      .limit(MAX),

    supabase
      .from('product_tasks')
      .select('id, title, product_id')
      .eq('account_id', accountId)
      .ilike('title', like)
      .limit(MAX),

    supabase
      .from('contacts')
      .select('id, name, phone, email')
      .eq('account_id', accountId)
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(MAX),
  ])

  const results: Record<string, SearchResult[]> = {}

  if (clientsRes.data?.length) {
    results.clients = clientsRes.data.map((c) => ({
      id: c.id,
      type: 'client' as const,
      title: c.name,
      subtitle: c.status,
      url: `/clients/${c.id}`,
    }))
  }

  if (enquiriesRes.data?.length) {
    results.enquiries = enquiriesRes.data.map((e) => ({
      id: e.id,
      type: 'enquiry' as const,
      title: e.title,
      subtitle: e.phone ?? e.status,
      url: `/client-leads/${e.id}`,
    }))
  }

  if (projectsRes.data?.length) {
    results.projects = projectsRes.data.map((p) => ({
      id: p.id,
      type: 'project' as const,
      title: p.name,
      subtitle: p.status,
      url: `/projects/${p.id}`,
    }))
  }

  if (tasksRes.data?.length) {
    results.tasks = tasksRes.data.map((t) => ({
      id: t.id,
      type: 'project_task' as const,
      title: t.title,
      url: `/projects/${t.project_id}`,
    }))
  }

  if (productsRes.data?.length) {
    results.products = productsRes.data.map((p) => ({
      id: p.id,
      type: 'product' as const,
      title: p.project_name,
      url: `/products/${p.id}`,
    }))
  }

  if (productTasksRes.data?.length) {
    results.product_tasks = productTasksRes.data.map((t) => ({
      id: t.id,
      type: 'product_task' as const,
      title: t.title,
      url: `/products/${t.product_id}`,
    }))
  }

  if (contactsRes.data?.length) {
    results.contacts = contactsRes.data.map((c) => ({
      id: c.id,
      type: 'contact' as const,
      title: c.name,
      subtitle: c.phone ?? c.email ?? undefined,
      url: `/contacts/${c.id}`,
    }))
  }

  return NextResponse.json({ results, query: q })
}
