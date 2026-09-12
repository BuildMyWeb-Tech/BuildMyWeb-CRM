"use client";

import { useState } from "react";
import {
  Loader2, Search, Save, Phone, Mail, Globe, MapPin, User,
  CheckCircle2, AlertCircle, Building2, Download,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

interface Lead {
  name: string;
  owner?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  notes?: string;
}

export default function LeadFinderPage() {
  const { accountId, user } = useAuth();
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [count, setCount] = useState("10");
  const [targetUrl, setTargetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function findLeads() {
    if (!niche.trim() || !location.trim()) {
      toast.error("Please enter both a niche and location.");
      return;
    }
    setLoading(true);
    setLeads(null);
    setError(null);
    setSaved(new Set());
    try {
      const res = await fetch("/api/leads/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: niche.trim(),
          location: location.trim(),
          count: parseInt(count) || 10,
          target_url: targetUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to find leads.");
        return;
      }
      if (data.source === "url" && data.raw) {
        // Show raw URL content
        setLeads([{ name: "Raw URL Content", notes: data.raw }]);
        return;
      }
      setLeads(data.leads ?? []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLead(lead: Lead, idx: number) {
    if (!accountId) return;
    setSaving(String(idx));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("client_leads").insert({
        account_id: accountId,
        title: lead.name,
        phone: lead.phone ?? null,
        notes: [lead.owner ? `Contact: ${lead.owner}` : "", lead.email ? `Email: ${lead.email}` : "", lead.address ?? "", lead.website ?? "", lead.notes ?? ""].filter(Boolean).join("\n"),
        status: "new",
        created_by: user?.id,
      });
      if (error) { toast.error("Could not save lead: " + error.message); return; }
      setSaved((prev) => new Set([...prev, idx]));
      toast.success(`"${lead.name}" saved as enquiry.`);
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    if (!leads || !accountId) return;
    setSaving("all");
    const supabase = createClient();
    let count = 0;
    for (let i = 0; i < leads.length; i++) {
      if (saved.has(i)) continue;
      const lead = leads[i];
      const { error } = await supabase.from("client_leads").insert({
        account_id: accountId,
        title: lead.name,
        phone: lead.phone ?? null,
        notes: [lead.owner ? `Contact: ${lead.owner}` : "", lead.email ? `Email: ${lead.email}` : "", lead.address ?? "", lead.website ?? "", lead.notes ?? ""].filter(Boolean).join("\n"),
        status: "new",
        created_by: user?.id,
      });
      if (!error) {
        setSaved((prev) => new Set([...prev, i]));
        count++;
      }
    }
    toast.success(`${count} leads saved as enquiries.`);
    setSaving(null);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#0f1117]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-[#2a3045]">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20">
            <Building2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Lead Finder</h1>
            <p className="text-xs text-slate-400">Find and import potential clients into your CRM</p>
          </div>
        </div>
      </div>

      {/* Search form */}
      <div className="shrink-0 px-6 py-4 border-b border-[#2a3045] bg-[#1a1f2e]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Niche / Industry</label>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") findLeads(); }}
              placeholder="e.g. Web Design Agency, Restaurant, IT Services"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") findLeads(); }}
              placeholder="e.g. Mumbai, Delhi, Bangalore"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Lead Count</label>
            <select value={count} onChange={(e) => setCount(e.target.value)}
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none">
              {[5, 10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Target URL (optional)</label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/directory"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={findLeads}
            disabled={loading || !niche.trim() || !location.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find Leads
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-4">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <p className="text-sm text-slate-400">Searching for {count} leads in {location}…</p>
          </div>
        )}

        {leads !== null && !loading && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">Found <span className="font-semibold text-white">{leads.length}</span> leads for <span className="text-blue-400">{niche}</span> in <span className="text-blue-400">{location}</span></p>
              {leads.length > 0 && (
                <button type="button" onClick={saveAll} disabled={saving === "all" || saved.size === leads.length}
                  className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors">
                  {saving === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Save All to CRM
                </button>
              )}
            </div>

            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 gap-3">
                <Building2 className="h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No leads found. Try a different niche or location.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {leads.map((lead, idx) => {
                  const isSaved = saved.has(idx);
                  const isSaving = saving === String(idx);
                  return (
                    <div key={idx} className={`relative rounded-xl border p-4 space-y-2 transition-colors ${isSaved ? "border-green-500/30 bg-green-500/5" : "border-[#2a3045] bg-[#1a1f2e] hover:border-blue-500/30"}`}>
                      {isSaved && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                          <Building2 className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white text-sm truncate">{lead.name}</p>
                          {lead.owner && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <User className="h-2.5 w-2.5" /> {lead.owner}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {lead.phone && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-blue-500 shrink-0" />
                            <a href={`tel:${lead.phone}`} className="hover:text-white transition-colors truncate">{lead.phone}</a>
                          </p>
                        )}
                        {lead.email && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-purple-500 shrink-0" />
                            <a href={`mailto:${lead.email}`} className="hover:text-white transition-colors truncate">{lead.email}</a>
                          </p>
                        )}
                        {lead.address && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-red-400 shrink-0" />
                            <span className="truncate">{lead.address}</span>
                          </p>
                        )}
                        {lead.website && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Globe className="h-3 w-3 text-teal-400 shrink-0" />
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors truncate">{lead.website}</a>
                          </p>
                        )}
                        {lead.notes && (
                          <p className="text-[10px] text-slate-500 italic leading-relaxed">{lead.notes}</p>
                        )}
                      </div>
                      {!isSaved && (
                        <button type="button" onClick={() => saveLead(lead, idx)} disabled={isSaving}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save to CRM
                        </button>
                      )}
                      {isSaved && (
                        <p className="text-center text-[10px] text-green-400 font-medium">Saved to CRM ✓</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {leads === null && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
              <Search className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <p className="text-base font-medium text-white">Find New Leads</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">Enter your niche and location, then click "Find Leads" to discover potential clients and import them into your CRM.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
