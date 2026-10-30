"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Bell, Save, Loader2, CheckCircle2, ArrowLeft, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

const EMPTY: FirebaseConfig = {
  apiKey: "", authDomain: "", projectId: "", storageBucket: "",
  messagingSenderId: "", appId: "", vapidKey: "",
};

export default function FirebaseConfigPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [config, setConfig] = useState<FirebaseConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("account_settings")
      .select("firebase_config")
      .eq("account_id", accountId)
      .maybeSingle();
    if (data?.firebase_config) setConfig({ ...EMPTY, ...(data.firebase_config as Partial<FirebaseConfig>) });
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!accountId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("account_settings")
      .upsert({ account_id: accountId, firebase_config: config }, { onConflict: "account_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Firebase configuration saved");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function sendTestNotification() {
    setTestSending(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (res.ok) {
        toast.success("Test notification sent! Check your device.");
      } else {
        toast.error("Could not send test notification — ensure Firebase is configured and the browser has push permission.");
      }
    } catch {
      toast.error("Test notification failed");
    } finally {
      setTestSending(false);
    }
  }

  const fields: { key: keyof FirebaseConfig; label: string; placeholder: string }[] = [
    { key: "apiKey", label: "API Key", placeholder: "AIzaSy..." },
    { key: "authDomain", label: "Auth Domain", placeholder: "your-app.firebaseapp.com" },
    { key: "projectId", label: "Project ID", placeholder: "your-firebase-project" },
    { key: "storageBucket", label: "Storage Bucket", placeholder: "your-app.appspot.com" },
    { key: "messagingSenderId", label: "Messaging Sender ID", placeholder: "123456789" },
    { key: "appId", label: "App ID", placeholder: "1:123:web:abc..." },
    { key: "vapidKey", label: "VAPID Key (Web Push)", placeholder: "BNvODMR..." },
  ];

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push("/office")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-500/10 p-2.5">
            <Bell className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Firebase Push Notifications</h1>
            <p className="text-sm text-slate-400">Configure Firebase Cloud Messaging for mobile & web push</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-xs text-orange-300 space-y-1">
        <p><strong>Setup guide:</strong></p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console <ExternalLink className="h-3 w-3 inline" /></a> → Create/open your project</li>
          <li>Project Settings → General → Your apps → Add web app → Copy config</li>
          <li>Cloud Messaging → Web configuration → Generate key pair → Copy VAPID key</li>
          <li>Paste all values below and save</li>
        </ol>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : (
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-6 space-y-5">
          <h2 className="text-sm font-semibold text-white">Firebase SDK Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-slate-400 text-xs">{f.label}</Label>
                <Input
                  type={f.key === "apiKey" || f.key === "vapidKey" ? "password" : "text"}
                  value={config[f.key]}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="bg-[#0f1117] border-[#2a3045] text-white font-mono text-xs"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-500 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : saved ? <CheckCircle2 className="h-4 w-4 mr-1 text-green-400" /> : <Save className="h-4 w-4 mr-1" />}
              {saved ? "Saved!" : "Save Configuration"}
            </Button>
            <Button variant="outline" disabled={testSending} onClick={sendTestNotification} className="border-[#2a3045] text-slate-300">
              {testSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
              Send Test Notification
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">What notifications will be sent?</h2>
        <ul className="space-y-2 text-xs text-slate-400">
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-blue-400 shrink-0" /> Task assigned to you</li>
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-orange-400 shrink-0" /> Lead follow-up due</li>
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-purple-400 shrink-0" /> Inbox message received</li>
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-green-400 shrink-0" /> @Mention in task or comment</li>
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-yellow-400 shrink-0" /> Broadcast completed</li>
        </ul>
      </div>
    </div>
  );
}
