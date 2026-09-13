"use client";

import { useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

interface AiAction {
  action: string;
  data: Record<string, unknown>;
  summary: string;
  follow_up?: { action: string; data: Record<string, unknown> } | null;
}

interface ResultMsg {
  ok: boolean;
  text: string;
}

export function AiAssistant() {
  const { accountId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<AiAction | null>(null);
  const [result, setResult] = useState<ResultMsg | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    setOpen((v) => {
      if (!v) {
        setPending(null);
        setResult(null);
        setMessage("");
        setTimeout(() => inputRef.current?.focus(), 80);
      }
      return !v;
    });
  }

  async function parseCommand() {
    const msg = message.trim();
    if (!msg) return;
    setLoading(true);
    setPending(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? "AI request failed" });
        return;
      }
      if (data.action === "unknown") {
        setResult({ ok: false, text: data.summary ?? "Could not understand command." });
        return;
      }
      setPending(data as AiAction);
    } catch {
      setResult({ ok: false, text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function runSingleAction(supabase: ReturnType<typeof createClient>, action: string, data: Record<string, unknown>): Promise<string> {
    if (action === "create_product") {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: data.project_name, purpose: data.purpose ?? null, priority: data.priority ?? "medium" }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create product");
      return `Product "${data.project_name}" created.`;

    } else if (action === "create_project") {
      let clientId: string | null = null;
      if (data.client_name) {
        const { data: existing } = await supabase.from("clients").select("id").eq("account_id", accountId).ilike("name", `%${data.client_name}%`).limit(1).maybeSingle();
        if (existing) { clientId = existing.id; }
        else {
          const { data: newClient } = await supabase.from("clients").insert({ account_id: accountId, name: data.client_name, created_by: user?.id }).select("id").single();
          clientId = newClient?.id ?? null;
        }
      }
      const { error } = await supabase.from("projects").insert({ account_id: accountId, name: data.name, status: data.status ?? "active", client_id: clientId, created_by: user?.id });
      if (error) throw new Error(error.message);
      return `Project "${data.name}" created successfully.`;

    } else if (action === "create_task") {
      let projectId: string | null = null;
      if (data.project_name) {
        const { data: proj } = await supabase.from("projects").select("id").eq("account_id", accountId).ilike("name", `%${data.project_name}%`).limit(1).maybeSingle();
        projectId = proj?.id ?? null;
      }
      const { error } = await supabase.from("project_tasks").insert({ account_id: accountId, title: data.title, project_id: projectId, due_date: data.due_date ?? null, show_date: data.show_date ?? null, priority: data.priority ?? "medium", created_by: user?.id });
      if (error) throw new Error(error.message);
      return `Task "${data.title}" created${data.show_date ? ` (visible from ${data.show_date})` : ""}.`;

    } else if (action === "create_enquiry") {
      const { error } = await supabase.from("client_leads").insert({ account_id: accountId, title: data.title, phone: data.phone ?? null, status: data.status ?? "in_discussion", created_by: user?.id });
      if (error) throw new Error(error.message);
      return `Enquiry "${data.title}" created.`;

    } else if (action === "create_product_task") {
      let productId: string | null = null;
      if (data.product_name) {
        const { data: prod } = await supabase.from("products").select("id").eq("account_id", accountId).ilike("project_name", `%${data.product_name}%`).limit(1).maybeSingle();
        productId = prod?.id ?? null;
      }
      const { error } = await supabase.from("product_tasks").insert({ account_id: accountId, title: data.title, product_id: productId, priority: data.priority ?? "medium", due_date: data.due_date ?? null, created_by: user?.id });
      if (error) throw new Error(error.message);
      return `Product task "${data.title}" created.`;

    } else if (action === "update_task") {
      const { data: tasks } = await supabase.from("project_tasks").select("id").eq("account_id", accountId).ilike("title", `%${data.title_query}%`).limit(1);
      if (!tasks?.length) throw new Error(`No task found matching "${data.title_query}".`);
      const { error } = await supabase.from("project_tasks").update(data.updates as Record<string, unknown>).eq("id", tasks[0].id);
      if (error) throw new Error(error.message);
      return `Task updated successfully.`;

    } else if (action === "delete_task") {
      const { data: tasks } = await supabase.from("project_tasks").select("id").eq("account_id", accountId).ilike("title", `%${data.title_query}%`).limit(1);
      if (!tasks?.length) throw new Error(`No task found matching "${data.title_query}".`);
      const { error } = await supabase.from("project_tasks").delete().eq("id", tasks[0].id);
      if (error) throw new Error(error.message);
      return `Task deleted.`;

    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  }

  async function executeAction() {
    if (!pending || !accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { action, data, follow_up } = pending;

      const msg = await runSingleAction(supabase, action, data);

      // Execute follow-up action (e.g. task after creating a product)
      if (follow_up) {
        try {
          const msg2 = await runSingleAction(supabase, follow_up.action, follow_up.data);
          setResult({ ok: true, text: `${msg} ${msg2}` });
        } catch {
          setResult({ ok: true, text: `${msg} (follow-up task failed — try adding it manually.)` });
        }
      } else {
        setResult({ ok: true, text: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setResult({ ok: false, text: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="AI Assistant"
        className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
          open ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Sparkles className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-4 top-14 z-50 w-96 rounded-xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">AI Assistant</p>
                <p className="text-[10px] text-muted-foreground">Type a command to create, update or delete CRM records</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {/* Examples */}
              {!pending && !result && (
                <div className="space-y-1.5">
                  {[
                    "Create a new project for Krish Info Tech with active status",
                    "Add task 'Send proposal' due 15th Sept 2026 show from 14th Sept",
                    "Create enquiry for John Doe phone 9876543210",
                  ].map((ex) => (
                    <button key={ex} type="button"
                      onClick={() => { setMessage(ex); inputRef.current?.focus(); }}
                      className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      {ex}
                    </button>
                  ))}
                </div>
              )}

              {/* Pending action confirmation */}
              {pending && !loading && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">{pending.summary}</p>
                  <p className="text-[10px] text-muted-foreground">Action: <code className="text-primary">{pending.action}</code></p>
                  <div className="flex gap-2">
                    <button type="button" onClick={executeAction}
                      className="flex-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      Confirm & Execute
                    </button>
                    <button type="button" onClick={() => { setPending(null); setMessage(""); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`rounded-lg border p-3 flex items-start gap-2 ${result.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                  {result.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    : <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                  <p className={`text-xs ${result.ok ? "text-green-300" : "text-red-300"}`}>{result.text}</p>
                </div>
              )}

              {/* Input */}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); parseCommand(); } }}
                  placeholder="Type a command…"
                  disabled={loading}
                  className="flex-1 h-9 rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                />
                <button type="button" onClick={parseCommand} disabled={loading || !message.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
