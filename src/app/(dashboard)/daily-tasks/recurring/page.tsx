"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { RotateCcw, Plus, Trash2, ArrowLeft, CheckCircle2, Clock, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecurrenceType = "daily" | "weekly" | "monthly";

interface RecurringTemplate {
  id: string;
  title: string;
  description: string;
  recurrenceType: RecurrenceType;
  projectId: string;
  projectName: string;
  lastCreated: string | null; // ISO date string
  createdAt: string;
}

interface Project { id: string; name: string; }

const STORAGE_KEY = "recurring-task-templates";

function loadTemplates(): RecurringTemplate[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveTemplates(ts: RecurringTemplate[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ts)); } catch {}
}

function isDue(t: RecurringTemplate): boolean {
  if (!t.lastCreated) return true;
  const last = new Date(t.lastCreated);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
  if (t.recurrenceType === "daily") return diffDays >= 1;
  if (t.recurrenceType === "weekly") return diffDays >= 7;
  if (t.recurrenceType === "monthly") return diffDays >= 28;
  return false;
}

function nextDue(t: RecurringTemplate): string {
  if (!t.lastCreated) return "Now";
  const last = new Date(t.lastCreated);
  const days = t.recurrenceType === "daily" ? 1 : t.recurrenceType === "weekly" ? 7 : 28;
  const next = new Date(last.getTime() + days * 86400000);
  const diff = Math.ceil((next.getTime() - Date.now()) / 86400000);
  if (diff <= 0) return "Due now";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

export default function RecurringTasksPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", recurrenceType: "weekly" as RecurrenceType, projectId: "" });

  useEffect(() => { setTemplates(loadTemplates()); }, []);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase.from("projects").select("id,name").eq("account_id", accountId).then(({ data }) => {
      setProjects((data ?? []) as Project[]);
      setLoading(false);
    });
  }, [accountId]);

  const createTask = useCallback(async (template: RecurringTemplate) => {
    setCreating(template.id);
    const supabase = createClient();
    const proj = projects.find((p) => p.id === template.projectId);
    if (!proj) { toast.error("Project not found"); setCreating(null); return; }

    // Get first pipeline stage for this project
    const { data: stagesData } = await supabase
      .from("pipeline_stages")
      .select("id")
      .order("position", { ascending: true })
      .limit(1);
    const stageId = stagesData?.[0]?.id;
    if (!stageId) { toast.error("No pipeline stage found"); setCreating(null); return; }

    const { error } = await supabase.from("project_tasks").insert({
      account_id: accountId,
      project_id: template.projectId,
      stage_id: stageId,
      title: template.title,
      description: template.description || null,
      priority: "medium",
    });

    if (error) { toast.error(error.message); setCreating(null); return; }

    const updated = templates.map((t) =>
      t.id === template.id ? { ...t, lastCreated: new Date().toISOString() } : t
    );
    setTemplates(updated);
    saveTemplates(updated);
    toast.success(`Created: "${template.title}"`);
    setCreating(null);
  }, [accountId, templates, projects]);

  function addTemplate() {
    if (!form.title.trim() || !form.projectId) { toast.error("Title and project are required"); return; }
    const proj = projects.find((p) => p.id === form.projectId);
    const t: RecurringTemplate = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      description: form.description.trim(),
      recurrenceType: form.recurrenceType,
      projectId: form.projectId,
      projectName: proj?.name ?? "",
      lastCreated: null,
      createdAt: new Date().toISOString(),
    };
    const updated = [...templates, t];
    setTemplates(updated);
    saveTemplates(updated);
    setForm({ title: "", description: "", recurrenceType: "weekly", projectId: "" });
    setShowForm(false);
    toast.success("Recurring task template added");
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  }

  const dueCount = templates.filter(isDue).length;

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/daily-tasks")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/10 p-2.5">
            <RotateCcw className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Recurring Tasks</h1>
            <p className="text-sm text-slate-400">Auto-create tasks on a schedule</p>
          </div>
        </div>
        {dueCount > 0 && (
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">{dueCount} due</span>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowForm((v) => !v)} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">New Recurring Template</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Task Title *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Weekly client check-in" className="bg-[#0f1117] border-[#2a3045] text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Project *</Label>
              <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none">
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Recurrence</Label>
              <select value={form.recurrenceType} onChange={(e) => setForm((f) => ({ ...f, recurrenceType: e.target.value as RecurrenceType }))}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Description (optional)</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Task notes…" className="bg-[#0f1117] border-[#2a3045] text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={addTemplate} className="bg-blue-600 hover:bg-blue-500 text-white">Save Template</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="border-[#2a3045] text-slate-300">Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-16 text-center">
          <RotateCcw className="h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-500">No recurring templates yet.</p>
          <Button size="sm" onClick={() => setShowForm(true)} variant="outline" className="border-[#2a3045] text-slate-300">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add your first template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const due = isDue(t);
            return (
              <div key={t.id} className={`rounded-xl border ${due ? "border-orange-500/30 bg-orange-500/5" : "border-[#2a3045] bg-[#1a1f2e]"} p-4 flex items-center gap-4`}>
                <div className={`rounded-lg p-2 ${due ? "bg-orange-500/10" : "bg-[#2a3045]"}`}>
                  <RotateCcw className={`h-4 w-4 ${due ? "text-orange-400" : "text-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500">{t.projectName}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${t.recurrenceType === "daily" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : t.recurrenceType === "weekly" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"}`}>
                      {t.recurrenceType}
                    </span>
                    <span className={`text-xs flex items-center gap-1 ${due ? "text-orange-400" : "text-slate-500"}`}>
                      <Clock className="h-3 w-3" /> {nextDue(t)}
                    </span>
                    {t.lastCreated && (
                      <span className="text-[11px] text-slate-600">Last: {new Date(t.lastCreated).toLocaleDateString("en-IN")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {due && (
                    <button type="button" disabled={creating === t.id} onClick={() => createTask(t)}
                      className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50">
                      {creating === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Create Now
                    </button>
                  )}
                  {!due && (
                    <span className="flex items-center gap-1 text-[11px] text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /> Created</span>
                  )}
                  <button type="button" onClick={() => deleteTemplate(t.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-[#2a3045] hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
