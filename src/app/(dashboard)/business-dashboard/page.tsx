"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, Users, KanbanSquare, ListTodo, AlertCircle,
  CheckCircle2, BarChart3, Star, Clock, Loader2, IndianRupee,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

interface DashData {
  totalRevenue: number;
  thisMonthRevenue: number;
  activeClients: number;
  activeProjects: number;
  completedProjects: number;
  pendingTasks: number;
  outstandingPayments: number;
  avgProjectValue: number;
  monthlyRevenue: { month: string; amount: number }[];
  projectStatus: { completed: number; inProgress: number; pending: number; onHold: number };
  clientRevenue: { name: string; amount: number }[];
  recentActivity: { label: string; type: "payment" | "project" | "client" | "task" | "invoice" }[];
  upcomingDeadlines: { name: string; due_date: string }[];
  avgRating: number;
  totalHoursThisMonth: number;
  totalExpensesThisMonth: number;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function BusinessDashboardPage() {
  const { accountId } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = `${thisMonth}-01`;

      const [
        clientsRes, projectsRes, tasksRes, invoicesRes,
        reviewsRes, timeRes, expensesRes, deadlinesRes,
      ] = await Promise.all([
        supabase.from("clients").select("id, status").eq("account_id", accountId),
        supabase.from("projects").select("id, name, status, budget, due_date").eq("account_id", accountId),
        supabase.from("project_tasks").select("id, status").eq("account_id", accountId),
        supabase.from("invoices").select("id, client_name, total_amount, paid_amount, balance_due, status, issue_date, created_at").eq("account_id", accountId),
        supabase.from("client_reviews").select("rating").eq("account_id", accountId),
        supabase.from("time_entries").select("hours, entry_date").eq("account_id", accountId).gte("entry_date", monthStart),
        supabase.from("expenses").select("amount, expense_date").eq("account_id", accountId).gte("expense_date", monthStart),
        supabase.from("projects").select("name, due_date").eq("account_id", accountId).eq("status", "active").not("due_date", "is", null).gte("due_date", now.toISOString().slice(0, 10)).order("due_date").limit(6),
      ]);

      const clients = clientsRes.data ?? [];
      const projects = projectsRes.data ?? [];
      const tasks = tasksRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const reviews = reviewsRes.data ?? [];
      const timeEntries = timeRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const deadlines = deadlinesRes.data ?? [];

      const activeClients = clients.filter((c) => c.status === "active").length;
      const activeProjects = projects.filter((p) => p.status === "active").length;
      const completedProjects = projects.filter((p) => p.status === "completed" || p.status === "archived").length;
      const pendingTasks = tasks.filter((t) => !["done","completed","closed"].includes(t.status?.toLowerCase() ?? "")).length;

      const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_amount ?? 0), 0);
      const thisMonthRevenue = invoices.filter((i) => i.issue_date?.startsWith(thisMonth) && i.status === "paid").reduce((s, i) => s + (i.total_amount ?? 0), 0);
      const outstandingPayments = invoices.filter((i) => ["sent","viewed","partially_paid","overdue"].includes(i.status)).reduce((s, i) => s + (i.balance_due ?? 0), 0);
      const avgProjectValue = completedProjects > 0 ? totalRevenue / completedProjects : 0;

      // Monthly revenue (last 6 months)
      const monthlyRevenue: { month: string; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const amt = invoices.filter((inv) => inv.issue_date?.startsWith(key) && inv.status === "paid").reduce((s, inv) => s + (inv.total_amount ?? 0), 0);
        monthlyRevenue.push({ month: MONTHS[d.getMonth()], amount: amt });
      }

      // Client revenue
      const byClient: Record<string, number> = {};
      for (const inv of invoices.filter((i) => i.status === "paid")) {
        byClient[inv.client_name || "Unknown"] = (byClient[inv.client_name || "Unknown"] ?? 0) + (inv.total_amount ?? 0);
      }
      const clientRevenue = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));

      const projectStatus = {
        completed: completedProjects,
        inProgress: projects.filter((p) => p.status === "active").length,
        pending: projects.filter((p) => p.status === "inactive").length,
        onHold: 0,
      };

      const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      const totalHoursThisMonth = timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
      const totalExpensesThisMonth = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

      // Recent activity (from invoices + latest projects)
      const recentActivity: { label: string; type: "payment" | "project" | "client" | "task" | "invoice" }[] = [
        ...invoices.filter((i) => i.status === "paid").slice(0, 2).map((i) => ({ label: `Payment received — ${fmt(i.total_amount ?? 0)}`, type: "payment" as const })),
        ...projects.filter((p) => p.status === "archived").slice(0, 2).map((p) => ({ label: `Project completed — ${p.name}`, type: "project" as const })),
        ...invoices.filter((i) => ["sent","overdue"].includes(i.status)).slice(0, 1).map((i) => ({ label: `Invoice pending — ${fmt(i.balance_due ?? 0)}`, type: "invoice" as const })),
      ].slice(0, 5);

      const upcomingDeadlines = (deadlines as { name: string; due_date: string }[]).map((d) => ({ name: d.name, due_date: d.due_date }));

      setData({
        totalRevenue, thisMonthRevenue, activeClients, activeProjects,
        completedProjects, pendingTasks, outstandingPayments, avgProjectValue,
        monthlyRevenue, projectStatus, clientRevenue, recentActivity,
        upcomingDeadlines, avgRating, totalHoursThisMonth, totalExpensesThisMonth,
      });
    } finally { setLoading(false); }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a0d14]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
    </div>
  );

  const d = data!;
  const maxMonth = Math.max(...(d?.monthlyRevenue.map((m) => m.amount) ?? [1]));
  const maxClientRev = d?.clientRevenue[0]?.amount ?? 1;

  const ACTIVITY_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
    payment:  { icon: CheckCircle2, color: "text-green-400" },
    project:  { icon: CheckCircle2, color: "text-blue-400" },
    client:   { icon: Users,         color: "text-purple-400" },
    task:     { icon: CheckCircle2, color: "text-teal-400" },
    invoice:  { icon: AlertCircle,  color: "text-amber-400" },
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      {/* Hero banner */}
      <div className="bg-gradient-to-b from-[#111827] to-[#0a0d14] border-b border-[#1e2435] px-4 sm:px-8 py-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-green-400 mb-4">
          Visual Command Center
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
          See Your Entire Business at a Glance.
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm">
          No more guessing. Your dashboard gives you a simple visual overview of important numbers across your freelance business.
        </p>
        <p className="mt-3 text-xs font-bold tracking-widest text-green-400 uppercase">Everything Important. One Screen.</p>
      </div>

      <div className="px-4 sm:px-8 py-8 space-y-8 max-w-7xl mx-auto">

        {/* 8 KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "TOTAL REVENUE", value: fmt(d.totalRevenue), sub: "Lifetime total", color: "text-green-400", icon: IndianRupee, href: "/office/invoices" },
            { label: "THIS MONTH", value: fmt(d.thisMonthRevenue), sub: "↑ Active pace", color: "text-green-400", icon: TrendingUp, href: "/office/invoices" },
            { label: "ACTIVE CLIENTS", value: String(d.activeClients), sub: "Retainer & One-off", color: "text-white", icon: Users, href: "/clients" },
            { label: "ACTIVE PROJECTS", value: String(d.activeProjects), sub: "In workflow", color: "text-white", icon: KanbanSquare, href: "/projects" },
            { label: "PENDING TASKS", value: String(d.pendingTasks), sub: "To complete", color: "text-amber-400", icon: ListTodo, href: "/daily-tasks" },
            { label: "OUTSTANDING PAYMENTS", value: fmt(d.outstandingPayments), sub: "Invoices issued", color: "text-red-400", icon: AlertCircle, href: "/office/invoices" },
            { label: "COMPLETED PROJECTS", value: String(d.completedProjects), sub: "Delivered", color: "text-white", icon: CheckCircle2, href: "/projects" },
            { label: "AVG PROJECT VALUE", value: fmt(d.avgProjectValue), sub: "Per client job", color: "text-white", icon: BarChart3, href: "/office/invoices" },
          ].map((card) => (
            <Link key={card.label} href={card.href}
              className="rounded-xl bg-[#111827] border border-[#1e2435] p-4 hover:border-[#2a3555] hover:bg-[#141c2e] transition-all group">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{card.label}</p>
                <card.icon className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
              </div>
              <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
              <p className="text-[11px] text-slate-600 mt-1">{card.sub}</p>
            </Link>
          ))}
        </div>

        {/* Extra KPI row — time, expenses, reviews */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Hours This Month", value: `${d.totalHoursThisMonth.toFixed(1)}h`, sub: "tracked", color: "text-teal-400", href: "/time-tracker" },
            { label: "Expenses This Month", value: fmt(d.totalExpensesThisMonth), sub: "business costs", color: "text-red-400", href: "/expenses" },
            { label: "Avg Rating", value: d.avgRating > 0 ? `${d.avgRating.toFixed(1)}/5` : "—", sub: "client reviews", color: "text-amber-400", href: "/reviews" },
          ].map((c) => (
            <Link key={c.label} href={c.href}
              className="rounded-xl bg-[#111827] border border-[#1e2435] p-4 hover:border-[#2a3555] transition-all">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{c.label}</p>
              <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">{c.sub}</p>
            </Link>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Monthly Revenue chart */}
          <div className="rounded-xl bg-[#111827] border border-[#1e2435] p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5">Monthly Revenue</p>
            <div className="space-y-3">
              {d.monthlyRevenue.map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-8">{m.month}</span>
                  <div className="flex-1 h-5 rounded-sm bg-[#1e2435] overflow-hidden">
                    <div
                      className="h-full rounded-sm bg-green-500 transition-all"
                      style={{ width: maxMonth > 0 ? `${(m.amount / maxMonth) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-20 text-right">{fmt(m.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Project Status */}
          <div className="rounded-xl bg-[#111827] border border-[#1e2435] p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5">Project Status</p>
            <div className="space-y-3">
              {[
                { label: "COMPLETED", count: d.projectStatus.completed, color: "bg-green-500", dot: "bg-green-500" },
                { label: "IN PROGRESS", count: d.projectStatus.inProgress, color: "bg-blue-500", dot: "bg-blue-500" },
                { label: "PENDING", count: d.projectStatus.pending, color: "bg-amber-500", dot: "bg-amber-500" },
                { label: "ON HOLD", count: d.projectStatus.onHold, color: "bg-red-500", dot: "bg-red-500" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    <span className="text-sm font-bold text-white">{s.label}</span>
                  </div>
                  <span className="text-lg font-black text-white">{s.count}</span>
                </div>
              ))}
            </div>
            {d.clientRevenue.length > 0 && (
              <>
                <div className="mt-5 pt-4 border-t border-[#1e2435]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Client Revenue</p>
                  <div className="space-y-2">
                    {d.clientRevenue.map((c) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 truncate max-w-[120px]">{c.name}</span>
                        <span className="text-xs font-semibold text-green-400">{fmt(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Recent Activity + Deadlines */}
          <div className="rounded-xl bg-[#111827] border border-[#1e2435] p-6 space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Recent Activity</p>
              {d.recentActivity.length === 0 ? (
                <p className="text-sm text-slate-600">No recent activity.</p>
              ) : (
                <div className="space-y-2.5">
                  {d.recentActivity.map((a, i) => {
                    const meta = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.task;
                    const Icon = meta.icon;
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.color}`} />
                        <span className="text-xs text-slate-300">{a.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {d.upcomingDeadlines.length > 0 && (
              <div className="pt-4 border-t border-[#1e2435]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Upcoming Deadlines</p>
                <div className="space-y-2">
                  {d.upcomingDeadlines.map((dl) => (
                    <div key={dl.name} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300 truncate">{dl.name}</span>
                      <span className="shrink-0 text-[10px] text-amber-400">Due {fmtDate(dl.due_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick nav to all modules */}
        <div className="rounded-xl bg-[#111827] border border-[#1e2435] p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">All Modules</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: "Clients", href: "/clients", color: "text-blue-400" },
              { label: "Projects", href: "/projects", color: "text-purple-400" },
              { label: "Tasks", href: "/daily-tasks", color: "text-teal-400" },
              { label: "Time", href: "/time-tracker", color: "text-teal-400" },
              { label: "Income", href: "/office/invoices", color: "text-green-400" },
              { label: "Expenses", href: "/expenses", color: "text-red-400" },
              { label: "Reviews", href: "/reviews", color: "text-amber-400" },
              { label: "Office", href: "/office", color: "text-slate-400" },
            ].map((m) => (
              <Link key={m.label} href={m.href}
                className="flex items-center justify-between rounded-lg border border-[#1e2435] bg-[#0a0d14] px-3 py-2.5 text-xs font-semibold hover:border-[#2a3555] hover:bg-[#0f1420] transition-all group">
                <span className={m.color}>{m.label}</span>
                <ArrowUpRight className="h-3 w-3 text-slate-700 group-hover:text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
