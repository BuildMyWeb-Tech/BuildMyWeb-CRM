"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Zap, Plus, Trash2, ArrowLeft, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MatchType = "exact" | "contains" | "starts_with";

interface KeywordRule {
  id: string;
  keyword: string;
  match_type: MatchType;
  reply: string;
  is_active: boolean;
  created_at: string;
}

export default function KeywordRepliesPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [rules, setRules] = useState<KeywordRule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ keyword: "", matchType: "contains" as MatchType, reply: "" });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const res = await fetch(`/api/keyword-replies?account_id=${accountId}`);
    const data = await res.json().catch(() => ({ rules: [] }));
    setRules(data.rules ?? []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function addRule() {
    if (!form.keyword.trim() || !form.reply.trim()) { toast.error("Keyword and reply are required"); return; }
    setSaving(true);
    const res = await fetch("/api/keyword-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, keyword: form.keyword, match_type: form.matchType, reply: form.reply }),
    });
    if (!res.ok) { toast.error("Could not save rule"); setSaving(false); return; }
    toast.success("Keyword rule added");
    setForm({ keyword: "", matchType: "contains", reply: "" });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function deleteRule(id: string) {
    const res = await fetch("/api/keyword-replies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, id }),
    });
    if (!res.ok) { toast.error("Could not delete rule"); return; }
    setRules((prev) => prev?.filter((r) => r.id !== id) ?? null);
    toast.success("Rule deleted");
  }

  async function toggleRule(rule: KeywordRule) {
    const res = await fetch("/api/keyword-replies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, id: rule.id, updates: { is_active: !rule.is_active } }),
    });
    if (!res.ok) { toast.error("Could not update rule"); return; }
    setRules((prev) => prev?.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r) ?? null);
  }

  const MATCH_LABEL: Record<MatchType, string> = { exact: "Exact match", contains: "Contains", starts_with: "Starts with" };

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/automations")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-yellow-500/10 p-2.5">
            <Zap className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">WhatsApp Keyword Auto-Reply</h1>
            <p className="text-sm text-slate-400">Auto-send replies when contacts message you with specific keywords</p>
          </div>
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowForm((v) => !v)} className="bg-yellow-600 hover:bg-yellow-500 text-white">
            <Plus className="h-4 w-4 mr-1" /> Add Rule
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-300">
        <strong>How it works:</strong> When an incoming WhatsApp message matches a keyword, the CRM automatically sends your preset reply. Rules are matched in order — first match wins. Requires an active WhatsApp connection.
      </div>

      {showForm && (
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">New Keyword Rule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Keyword *</Label>
              <Input value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                placeholder="e.g. price, hello, info" className="bg-[#0f1117] border-[#2a3045] text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Match Type</Label>
              <select value={form.matchType} onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value as MatchType }))}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none">
                <option value="contains">Contains keyword</option>
                <option value="exact">Exact match</option>
                <option value="starts_with">Starts with keyword</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-slate-400 text-xs">Auto-reply message *</Label>
              <Textarea value={form.reply} onChange={(e) => setForm((f) => ({ ...f, reply: e.target.value }))}
                placeholder="Hi! Thanks for reaching out. Our pricing starts at…" rows={3}
                className="bg-[#0f1117] border-[#2a3045] text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving} onClick={addRule} className="bg-yellow-600 hover:bg-yellow-500 text-white">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save Rule
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="border-[#2a3045] text-slate-300">Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : !rules || rules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-16 text-center">
          <Zap className="h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-500">No keyword rules yet.</p>
          <Button size="sm" onClick={() => setShowForm(true)} variant="outline" className="border-[#2a3045] text-slate-300">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add first rule
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2a3045] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{rules.length} Rules</h2>
            <span className="text-xs text-slate-500">{rules.filter((r) => r.is_active).length} active</span>
          </div>
          <div className="divide-y divide-[#2a3045]">
            {rules.map((rule) => (
              <div key={rule.id} className={`px-5 py-4 flex items-start gap-4 ${rule.is_active ? "" : "opacity-50"}`}>
                <button type="button" onClick={() => toggleRule(rule)} className="mt-0.5 shrink-0 text-slate-500 hover:text-yellow-400 transition-colors">
                  {rule.is_active ? <ToggleRight className="h-5 w-5 text-yellow-400" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-yellow-300">&quot;{rule.keyword}&quot;</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a3045] text-slate-500">
                      {MATCH_LABEL[rule.match_type]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rule.reply}</p>
                </div>
                <button type="button" onClick={() => deleteRule(rule.id)}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-[#2a3045] hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
