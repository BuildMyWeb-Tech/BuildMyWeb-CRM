"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { TrendingUp, ArrowLeft, Loader2, Users, Target, Radio } from "lucide-react";

interface CampaignROI {
  campaignName: string;
  totalContacts: number;
  broadcastCount: number;
  leadsGenerated: number;
  conversionRate: number;
}

export default function CampaignROIPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [data, setData] = useState<CampaignROI[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();

    // Get campaign names with contact counts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("campaign_name")
      .eq("account_id", accountId)
      .not("campaign_name", "is", null);

    // Get broadcasts per campaign (by name match)
    const { data: broadcasts } = await supabase
      .from("broadcasts")
      .select("name, total_recipients, status")
      .eq("account_id", accountId);

    // Get client leads by source
    const { data: leads } = await supabase
      .from("client_leads")
      .select("source, status")
      .eq("account_id", accountId);

    // Aggregate campaign counts
    const campaignMap: Record<string, { contacts: number; broadcasts: number; leads: number }> = {};

    for (const c of contacts ?? []) {
      const cn = c.campaign_name as string;
      if (!campaignMap[cn]) campaignMap[cn] = { contacts: 0, broadcasts: 0, leads: 0 };
      campaignMap[cn].contacts++;
    }

    for (const b of broadcasts ?? []) {
      // Match broadcast to campaign by name prefix
      const entry = Object.keys(campaignMap).find((k) => b.name?.toLowerCase().includes(k.toLowerCase()));
      if (entry) campaignMap[entry].broadcasts++;
    }

    for (const l of leads ?? []) {
      const src = l.source as string | null;
      if (src && campaignMap[src]) {
        campaignMap[src].leads++;
      }
    }

    const result: CampaignROI[] = Object.entries(campaignMap).map(([name, stats]) => ({
      campaignName: name,
      totalContacts: stats.contacts,
      broadcastCount: stats.broadcasts,
      leadsGenerated: stats.leads,
      conversionRate: stats.contacts > 0 ? Math.round((stats.leads / stats.contacts) * 100) : 0,
    })).sort((a, b) => b.leadsGenerated - a.leadsGenerated);

    setData(result);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/broadcasts")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-500/10 p-2.5">
            <TrendingUp className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Campaign ROI Tracker</h1>
            <p className="text-sm text-slate-400">Broadcast campaigns → lead conversions</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-20 text-center">
          <TrendingUp className="h-10 w-10 text-slate-700" />
          <p className="text-sm text-slate-500">No campaign data yet. Create contacts with a campaign name and send broadcasts to track ROI.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-2xl font-bold text-white">{data.length}</p>
              <p className="text-xs text-slate-400">Active Campaigns</p>
            </div>
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-2xl font-bold text-green-400">{data.reduce((s, r) => s + r.leadsGenerated, 0)}</p>
              <p className="text-xs text-slate-400">Total Leads Generated</p>
            </div>
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-2xl font-bold text-blue-400">{data.reduce((s, r) => s + r.totalContacts, 0)}</p>
              <p className="text-xs text-slate-400">Total Contacts Reached</p>
            </div>
          </div>

          {/* Campaign table */}
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 font-medium">Campaign</th>
                    <th className="px-5 py-3 font-medium"><Users className="h-3 w-3 inline mr-1" />Contacts</th>
                    <th className="px-5 py-3 font-medium"><Radio className="h-3 w-3 inline mr-1" />Broadcasts</th>
                    <th className="px-5 py-3 font-medium"><Target className="h-3 w-3 inline mr-1" />Leads</th>
                    <th className="px-5 py-3 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.campaignName} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e]">
                      <td className="px-5 py-3">
                        <span className="font-medium text-white">{row.campaignName}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{row.totalContacts}</td>
                      <td className="px-5 py-3 text-slate-300">{row.broadcastCount}</td>
                      <td className="px-5 py-3">
                        <span className={`font-semibold ${row.leadsGenerated > 0 ? "text-green-400" : "text-slate-500"}`}>
                          {row.leadsGenerated}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 rounded-full bg-[#2a3045] overflow-hidden">
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${row.conversionRate}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{row.conversionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
