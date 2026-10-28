"use client";

import { useState } from "react";
import { Sparkles, Loader2, Trash2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SearchBusiness } from "@/app/api/leads/search/route";

interface SaveResult {
  searched: number;
  inserted: number;
  duplicates: number;
  skippedNoPhone: number;
  qualified: number;
  qualifyFailed: number;
  aiConfigured: boolean;
  insertError?: string;
}

export default function LeadSourcingPage() {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [count, setCount] = useState(30);
  const [campaignName, setCampaignName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SearchBusiness[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaveResult(null);
    try {
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, location, count }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Something went wrong."); return; }
      const businesses: SearchBusiness[] = data.businesses ?? [];
      setPreview((prev) => {
        if (prev) {
          // "Add more" mode — append, dedup by placeId
          const existingIds = new Set(prev.map((b) => b.placeId));
          const newOnes = businesses.filter((b) => !b.placeId || !existingIds.has(b.placeId));
          return [...prev, ...newOnes];
        }
        return businesses;
      });
      // Select all new rows by default
      setSelected((prev) => {
        const s = new Set(prev);
        if (!preview) {
          businesses.forEach((_, i) => s.add(i));
        } else {
          const base = preview.length;
          businesses.forEach((_, i) => s.add(base + i));
        }
        return s;
      });
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function removeRow(idx: number) {
    if (!preview) return;
    const next = preview.filter((_, i) => i !== idx);
    const nextSel = new Set<number>();
    selected.forEach((i) => { if (i !== idx) nextSel.add(i > idx ? i - 1 : i); });
    setPreview(next);
    setSelected(nextSel);
  }

  function toggleRow(idx: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  }

  function removeSelectedRows() {
    if (!preview) return;
    const next = preview.filter((_, i) => !selected.has(i));
    setPreview(next.length ? next : null);
    setSelected(new Set(next.map((_, i) => i)));
  }

  async function handleSave() {
    if (!preview) return;
    const toSave = preview.filter((_, i) => selected.has(i));
    if (toSave.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, location, count: toSave.length, campaign_name: campaignName.trim() || undefined, businesses: toSave }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Save failed."); return; }
      setSaveResult(data);
      setPreview(null);
      setSelected(new Set());
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Lead Sourcing
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Search for businesses by niche and location, review results, then save to Leads Captured.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{preview ? "Add more leads" : "New search"}</CardTitle>
          <CardDescription>
            Pulled from Google Maps. Results without a phone number are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign">Campaign / Group Name</Label>
              <Input
                id="campaign"
                placeholder="e.g. Gym First Campaign Trichy"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="niche">Niche</Label>
                <Input
                  id="niche"
                  placeholder="e.g. unisex salon, pharmacy"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Andheri, Mumbai"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count">Leads to fetch (1-60)</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={60}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <Button type="submit" disabled={loading} className="mt-2">
              {loading ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Searching…</>
              ) : preview ? (
                <><Plus className="mr-1.5 h-4 w-4" /> Add More Leads</>
              ) : (
                "Find Leads"
              )}
            </Button>
          </form>

          {error && (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">
              Preview — {preview.length} businesses found
              {selected.size < preview.length && ` (${selected.size} selected)`}
            </h2>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button variant="outline" size="sm" onClick={removeSelectedRows}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove {selected.size} selected
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving || selected.size === 0}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save {selected.size} to Leads Captured
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input type="checkbox"
                        checked={selected.size === preview.length}
                        onChange={() => setSelected(selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i)))}
                        className="h-4 w-4 rounded accent-primary" />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Address</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Rating</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {preview.map((biz, idx) => (
                    <tr key={biz.placeId ?? idx} className={`border-b border-border last:border-0 transition-colors ${selected.has(idx) ? "bg-primary/5" : "bg-background"}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleRow(idx)}
                          className="h-4 w-4 rounded accent-primary" />
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{biz.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{biz.phone ?? <span className="text-xs text-destructive">No phone</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={biz.address ?? ""}>{biz.address ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{biz.rating != null ? `${biz.rating} ★` : "—"}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeRow(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {saveResult && (
        <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">{saveResult.searched} businesses saved</p>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            <li>{saveResult.inserted} added as new contacts</li>
            <li>{saveResult.duplicates} already existed (skipped)</li>
            <li>{saveResult.skippedNoPhone} had no phone number (skipped)</li>
            <li>{saveResult.qualified} qualified by AI</li>
            {saveResult.qualifyFailed > 0 && (
              <li className="text-amber-500">{saveResult.qualifyFailed} failed AI qualification — still imported</li>
            )}
          </ul>
          {saveResult.insertError && (
            <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-400 font-mono text-xs break-all">
              Insert error: {saveResult.insertError}
            </p>
          )}
          {!saveResult.aiConfigured && saveResult.inserted > 0 && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-500">
              Contacts imported, but no AI configured — set one up under AI Agents → Setup to enable scoring.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
