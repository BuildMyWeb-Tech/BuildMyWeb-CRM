"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown, ChevronRight, Loader2, Plus, Power, Trash2, Zap, History, X, Check
} from "lucide-react";
import type { CrmAutomation, CrmTriggerType, CrmActionType, CrmCondition, CrmAction } from "@/types";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<CrmTriggerType, { label: string; description: string }> = {
  project_status_changed: { label: "Project Status Changed", description: "When a project moves to a new status" },
  task_status_changed: { label: "Task Status Changed", description: "When a task is marked as a different status" },
  task_created: { label: "Task Created", description: "When a new task is added to a project" },
  task_assigned: { label: "Task Assigned", description: "When a task is assigned to someone" },
  task_overdue: { label: "Task Overdue", description: "When a task passes its due date without completion" },
  enquiry_status_changed: { label: "Enquiry Status Changed", description: "When an enquiry moves through the pipeline" },
  enquiry_created: { label: "Enquiry Created", description: "When a new enquiry is received" },
  client_created: { label: "Client Created", description: "When a new client is added" },
  payment_received: { label: "Payment Received", description: "When a payment is recorded" },
};

const ACTION_META: Record<CrmActionType, { label: string }> = {
  create_task: { label: "Create a Task" },
  assign_user: { label: "Assign to User" },
  send_notification: { label: "Send Notification" },
  update_status: { label: "Update Status" },
  add_note: { label: "Add Note" },
};

const CONDITION_OPERATORS = ["equals", "not_equals", "contains", "gt", "lt"] as const;
const CONDITION_FIELDS = [
  "status", "priority", "assigned_user_id", "amount", "due_date", "source",
];

// ─────────────────────────────────────────────────────────────────────────────
// Empty automation builder state
// ─────────────────────────────────────────────────────────────────────────────

function emptyAutomation() {
  return {
    name: "",
    description: "",
    trigger_type: "project_status_changed" as CrmTriggerType,
    trigger_config: {} as Record<string, string>,
    conditions: [] as CrmCondition[],
    actions: [] as CrmAction[],
    is_active: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual rule builder dialog
// ─────────────────────────────────────────────────────────────────────────────

function AutomationDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: CrmAutomation | null;
  onClose: () => void;
  onSave: (data: ReturnType<typeof emptyAutomation>) => Promise<void>;
}) {
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? "",
          trigger_type: initial.trigger_type,
          trigger_config: initial.trigger_config as Record<string, string>,
          conditions: initial.conditions,
          actions: initial.actions,
          is_active: initial.is_active,
        }
      : emptyAutomation()
  );
  const [saving, setSaving] = useState(false);

  function addCondition() {
    setForm((f) => ({
      ...f,
      conditions: [...f.conditions, { field: "status", operator: "equals", value: "" }],
    }));
  }

  function updateCondition(i: number, patch: Partial<CrmCondition>) {
    setForm((f) => {
      const c = [...f.conditions];
      c[i] = { ...c[i], ...patch };
      return { ...f, conditions: c };
    });
  }

  function removeCondition(i: number) {
    setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  }

  function addAction() {
    setForm((f) => ({
      ...f,
      actions: [...f.actions, { type: "send_notification", config: { message: "" } }],
    }));
  }

  function updateAction(i: number, patch: Partial<CrmAction>) {
    setForm((f) => {
      const a = [...f.actions];
      a[i] = { ...a[i], ...patch };
      return { ...f, actions: a };
    });
  }

  function removeAction(i: number) {
    setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
  }

  async function submit() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.actions.length === 0) { toast.error("Add at least one action"); return; }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {initial ? "Edit Automation" : "New Automation"}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Name + description */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
                placeholder="e.g. Auto-assign task on new client"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* WHEN — trigger */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">WHEN (Trigger)</h3>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
              <select
                value={form.trigger_type}
                onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value as CrmTriggerType }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {(Object.keys(TRIGGER_META) as CrmTriggerType[]).map((t) => (
                  <option key={t} value={t}>{TRIGGER_META[t].label}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                {TRIGGER_META[form.trigger_type].description}
              </p>
            </div>
          </div>

          {/* IF — conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">IF (Conditions)</h3>
              <button
                type="button"
                onClick={addCondition}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add condition
              </button>
            </div>
            {form.conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/50 py-4 text-center text-xs text-muted-foreground">
                No conditions — automation will always trigger
              </p>
            ) : (
              <div className="space-y-2">
                {form.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
                    <select
                      value={c.field}
                      onChange={(e) => updateCondition(i, { field: e.target.value })}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select
                      value={c.operator}
                      onChange={(e) => updateCondition(i, { operator: e.target.value as CrmCondition["operator"] })}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {CONDITION_OPERATORS.map((op) => <option key={op} value={op}>{op.replace("_", " ")}</option>)}
                    </select>
                    <input
                      value={c.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      placeholder="value"
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button type="button" onClick={() => removeCondition(i)} className="text-muted-foreground hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* THEN — actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">THEN (Actions)</h3>
              <button
                type="button"
                onClick={addAction}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add action
              </button>
            </div>
            {form.actions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/50 py-4 text-center text-xs text-muted-foreground">
                Add at least one action
              </p>
            ) : (
              <div className="space-y-2">
                {form.actions.map((a, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <select
                        value={a.type}
                        onChange={(e) => updateAction(i, { type: e.target.value as CrmActionType, config: {} })}
                        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        {(Object.keys(ACTION_META) as CrmActionType[]).map((t) => (
                          <option key={t} value={t}>{ACTION_META[t].label}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeAction(i)} className="text-muted-foreground hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Action-specific config fields */}
                    {a.type === "send_notification" && (
                      <input
                        value={(a.config.message as string) ?? ""}
                        onChange={(e) => updateAction(i, { config: { ...a.config, message: e.target.value } })}
                        placeholder="Notification message…"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                    {a.type === "create_task" && (
                      <input
                        value={(a.config.title as string) ?? ""}
                        onChange={(e) => updateAction(i, { config: { ...a.config, title: e.target.value } })}
                        placeholder="Task title…"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                    {a.type === "add_note" && (
                      <input
                        value={(a.config.note as string) ?? ""}
                        onChange={(e) => updateAction(i, { config: { ...a.config, note: e.target.value } })}
                        placeholder="Note text…"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                    {a.type === "update_status" && (
                      <input
                        value={(a.config.status as string) ?? ""}
                        onChange={(e) => updateAction(i, { config: { ...a.config, status: e.target.value } })}
                        placeholder="New status value…"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                    {a.type === "assign_user" && (
                      <input
                        value={(a.config.user_id as string) ?? ""}
                        onChange={(e) => updateAction(i, { config: { ...a.config, user_id: e.target.value } })}
                        placeholder="User ID to assign…"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            Active
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution history panel
// ─────────────────────────────────────────────────────────────────────────────

function LogsPanel({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<Array<{
    id: string; status: string; created_at: string; error_message: string | null; actions_taken: unknown[];
  }> | null>(null);

  useEffect(() => {
    fetch(`/api/crm-automations/${automationId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setLogs(d?.automation?.logs ?? []));
  }, [automationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <History className="h-4 w-4" /> Execution History
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {logs === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No executions yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`rounded-lg border p-3 text-sm ${
                  log.status === "success" ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20" :
                  log.status === "error" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" :
                  "border-border bg-muted/50"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-medium capitalize ${
                      log.status === "success" ? "text-green-600 dark:text-green-400" :
                      log.status === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                    }`}>{log.status}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="mt-1 text-xs text-red-500">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CrmAutomationsPage() {
  const [automations, setAutomations] = useState<CrmAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<CrmAutomation | null>(null);
  const [logsTarget, setLogsTarget] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/crm-automations")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setAutomations(d?.automations ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: ReturnType<typeof emptyAutomation>) {
    const url = editTarget ? `/api/crm-automations/${editTarget.id}` : "/api/crm-automations";
    const method = editTarget ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) { toast.error("Could not save automation"); return; }
    toast.success(editTarget ? "Automation updated" : "Automation created");
    setShowDialog(false);
    setEditTarget(null);
    load();
  }

  async function toggleActive(a: CrmAutomation) {
    const r = await fetch(`/api/crm-automations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    if (!r.ok) { toast.error("Could not update"); return; }
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this automation?")) return;
    const r = await fetch(`/api/crm-automations/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Could not delete"); return; }
    toast.success("Deleted");
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" /> CRM Automation Engine
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Automate project, task, and enquiry workflows with IF/THEN rules
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEditTarget(null); setShowDialog(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Automation
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">No automations yet</p>
              <p className="text-sm text-muted-foreground">Create your first IF/THEN rule to automate repetitive work</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditTarget(null); setShowDialog(true); }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Create first automation
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    a.is_active ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40" : "bg-muted text-muted-foreground"
                  }`}>
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{a.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.is_active
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {a.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-blue-500">{TRIGGER_META[a.trigger_type]?.label}</span>
                      {" · "}
                      {a.conditions.length} condition{a.conditions.length !== 1 ? "s" : ""}
                      {" · "}
                      {a.actions.length} action{a.actions.length !== 1 ? "s" : ""}
                      {" · "}
                      Ran {a.run_count} time{a.run_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setLogsTarget(a.id)}
                      title="Execution history"
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <History className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(a)}
                      title={a.is_active ? "Pause" : "Activate"}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Power className={`h-4 w-4 ${a.is_active ? "text-green-500" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditTarget(a); setShowDialog(true); }}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                    >
                      {expanded === a.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {expanded === a.id && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
                    {/* Trigger */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">WHEN</span>
                      <p className="text-sm text-foreground">{TRIGGER_META[a.trigger_type]?.description}</p>
                    </div>
                    {/* Conditions */}
                    {a.conditions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IF</span>
                        <ul className="mt-1 space-y-1">
                          {a.conditions.map((c, i) => (
                            <li key={i} className="text-sm text-foreground">
                              <span className="font-mono text-xs">{c.field}</span>{" "}
                              <span className="text-muted-foreground">{c.operator.replace("_", " ")}</span>{" "}
                              <span className="font-mono text-xs">{c.value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Actions */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">THEN</span>
                      <ul className="mt-1 space-y-1">
                        {a.actions.map((ac, i) => (
                          <li key={i} className="text-sm text-foreground">
                            {ACTION_META[ac.type as CrmActionType]?.label ?? ac.type}
                            {ac.config.message ? <span className="ml-1 text-muted-foreground">"{String(ac.config.message)}"</span> : null}
                            {ac.config.title ? <span className="ml-1 text-muted-foreground">"{String(ac.config.title)}"</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(showDialog || editTarget) && (
        <AutomationDialog
          initial={editTarget}
          onClose={() => { setShowDialog(false); setEditTarget(null); }}
          onSave={handleSave}
        />
      )}
      {logsTarget && (
        <LogsPanel automationId={logsTarget} onClose={() => setLogsTarget(null)} />
      )}
    </div>
  );
}
