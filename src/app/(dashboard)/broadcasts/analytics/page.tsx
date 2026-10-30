"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { BarChart3, ArrowLeft, TrendingUp, Users, Eye, MessageSquare, Clock, Send } from "lucide-react";
import { Loader2 } from "lucide-react";

interface BroadcastSummary {
  id: string;
  name: string;
  created_at: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-[#2a3045] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof BarChart3; color: string }) {
  return (
    <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4 flex items-center gap-3">
      <div className={`rounded-lg p-2 ${color}/10`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function BroadcastAnalyticsPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("broadcasts")
      .select("id,name,created_at,status,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50);
    setBroadcasts((data ?? []) as BroadcastSummary[]);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const totals = broadcasts ? {
    recipients: broadcasts.reduce((s, b) => s + (b.total_recipients ?? 0), 0),
    sent: broadcasts.reduce((s, b) => s + (b.sent_count ?? 0), 0),
    delivered: broadcasts.reduce((s, b) => s + (b.delivered_count ?? 0), 0),
    read: broadcasts.reduce((s, b) => s + (b.read_count ?? 0), 0),
    replied: broadcasts.reduce((s, b) => s + (b.replied_count ?? 0), 0),
    failed: broadcasts.reduce((s, b) => s + (b.failed_count ?? 0), 0),
  } : null;

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/broadcasts")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-500/10 p-2.5">
            <BarChart3 className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Broadcast Analytics</h1>
            <p className="text-sm text-slate-400">Performance across all campaigns</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          {/* Overview tiles */}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatTile label="Total Contacts" value={totals.recipients} icon={Users} color="text-blue-400" />
              <StatTile label="Sent" value={totals.sent} icon={Send} color="text-indigo-400" />
              <StatTile label="Delivered" value={totals.delivered} icon={TrendingUp} color="text-cyan-400" />
              <StatTile label="Read" value={totals.read} icon={Eye} color="text-green-400" />
              <StatTile label="Replied" value={totals.replied} icon={MessageSquare} color="text-yellow-400" />
              <StatTile label="Failed" value={totals.failed} icon={Clock} color="text-red-400" />
            </div>
          )}

          {/* Per-broadcast breakdown */}
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3045]">
              <h2 className="text-sm font-semibold text-white">Per Campaign</h2>
            </div>
            {broadcasts && broadcasts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16">
                <BarChart3 className="h-8 w-8 text-slate-700" />
                <p className="text-sm text-slate-500">No broadcasts yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a3045]">
                {(broadcasts ?? []).map((b) => {
                  const max = b.total_recipients || 1;
                  const delivRate = b.sent_count > 0 ? Math.round((b.delivered_count / b.sent_count) * 100) : 0;
                  const readRate = b.delivered_count > 0 ? Math.round((b.read_count / b.delivered_count) * 100) : 0;
                  const replyRate = b.read_count > 0 ? Math.round((b.replied_count / b.read_count) * 100) : 0;
                  return (
                    <div key={b.id} className="px-5 py-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
                      <div className="lg:col-span-2">
                        <p className="text-sm font-medium text-white truncate">{b.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${b.status === "completed" ? "bg-green-500/10 text-green-400 border-green-500/20" : b.status === "sent" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                            {b.status}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{b.total_recipients} contacts</p>
                      </div>
                      <div className="lg:col-span-3 grid grid-cols-1 gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="w-16 shrink-0">Delivered</span>
                          <Bar value={b.delivered_count} max={max} color="bg-cyan-500" />
                          <span className="text-[10px] text-slate-500 w-10 shrink-0">{delivRate}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="w-16 shrink-0">Read</span>
                          <Bar value={b.read_count} max={max} color="bg-green-500" />
                          <span className="text-[10px] text-slate-500 w-10 shrink-0">{readRate}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="w-16 shrink-0">Replied</span>
                          <Bar value={b.replied_count} max={max} color="bg-yellow-500" />
                          <span className="text-[10px] text-slate-500 w-10 shrink-0">{replyRate}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
