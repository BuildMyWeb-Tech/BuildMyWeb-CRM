'use client';

// ============================================================
// ApiKeysSettings — Settings → API keys
//
// Manage the credentials that authenticate the public REST API
// (`/api/v1/*`). Any member sees the roster (read-only); admin+ can
// mint and revoke (gated by <RequireRole min="admin"> here and the
// admin-only API routes + RLS on the server).
//
// One-time reveal: a freshly-minted key's plaintext is shown ONCE in
// the creation dialog. After it closes, only the prefix remains —
// the server stores just the hash. The UI states this explicitly so
// the absence of a "copy again" button reads as intentional, not a
// bug (same lesson as the invite-link flow).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import {
  API_SCOPES,
  SCOPE_DESCRIPTIONS,
  type ApiScope,
} from '@/lib/api-keys/scopes';
import { useTranslations } from 'next-intl';
import { SettingsPanelHead } from './settings-panel-head';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function keyStatus(k: ApiKey): 'active' | 'revoked' | 'expired' {
  if (k.revoked_at) return 'revoked';
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now())
    return 'expired';
  return 'active';
}

export function ApiKeysSettings() {
  const { canEditSettings } = useAuth();
  const t = useTranslations('Settings.apiKeys');

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/api-keys', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const data = (await res.json()) as { keys: ApiKey[] };
      setKeys(data.keys);
    } catch (err) {
      console.error('[ApiKeysSettings] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(key: ApiKey) {
    setRevoking(key.id);
    try {
      const res = await fetch(`/api/account/api-keys/${key.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('revokeFailed'));
        return;
      }
      toast.success(t('revokeSuccess', { name: key.name }));
      // Reflect the revoke locally without a refetch.
      setKeys((prev) =>
        prev.map((k) =>
          k.id === key.id ? { ...k, revoked_at: new Date().toISOString() } : k
        )
      );
    } catch (err) {
      console.error('[ApiKeysSettings] revoke error:', err);
      toast.error(t('networkError'));
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={
          t.rich('description', {
            apiCode: (chunks: React.ReactNode) => <code className="text-xs">{chunks}</code>,
            headerCode: (chunks: React.ReactNode) => <code className="text-xs">{chunks}</code>
          })
        }
        action={
          <RequireRole min="admin">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t('newApiKey')}
            </Button>
          </RequireRole>
        }
      />

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <KeyRound className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">
              {t('noApiKeys')}
            </p>
            {canEditSettings ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {t.rich('createOneHint', {
                  bold: (chunks: React.ReactNode) => (
                    <span className="text-foreground">{chunks}</span>
                  ),
                })}
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('askAdminHint')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {keys.map((k) => {
                const status = keyStatus(k);
                const inactive = status !== 'active';
                return (
                  <li
                    key={k.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm font-medium ${
                            inactive
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          }`}
                        >
                          {k.name}
                        </span>
                        {status === 'revoked' && (
                          <Badge className="border-border bg-muted text-muted-foreground text-[10px] tracking-wide uppercase">
                            {t('revoked')}
                          </Badge>
                        )}
                        {status === 'expired' && (
                          <Badge className="border-border bg-muted text-muted-foreground text-[10px] tracking-wide uppercase">
                            {t('expired')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                        {k.key_prefix}…
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {k.scopes.length === 0 ? (
                          <span className="text-muted-foreground text-xs">
                            {t('noScopes')}
                          </span>
                        ) : (
                          k.scopes.map((s) => (
                            <Badge
                              key={s}
                              className="border-border bg-muted text-muted-foreground text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {t('created', { date: fmtDate(k.created_at) })}
                        {' · '}
                        {k.last_used_at
                          ? t('lastUsed', { date: fmtDate(k.last_used_at) })
                          : t('neverUsed')}
                        {k.expires_at && status !== 'expired'
                          ? ` · ${t('expires', { date: fmtDate(k.expires_at) })}`
                          : ''}
                      </p>
                    </div>

                    {status === 'active' && (
                      <RequireRole min="admin">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(k)}
                          disabled={revoking === k.id}
                          className="self-start border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-200 sm:self-auto"
                        >
                          {revoking === k.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          {t('revoke')}
                        </Button>
                      </RequireRole>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />

      {/* AI Assistant key section */}
      <AiKeyCard />
    </section>
  );
}

// ------------------------------------------------------------
// AI Assistant key card — lets users configure OpenAI / Anthropic
// key for the AI Assistant without going to the Agents page.
// ------------------------------------------------------------

type AiProvider = 'openai' | 'anthropic' | 'gemini';

interface AiStatus {
  configured: boolean;
  has_key: boolean;
  provider?: AiProvider;
  model?: string;
  is_active?: boolean;
}

function AiKeyCard() {
  const { canEditSettings: canEdit } = useAuth();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/ai/config', { cache: 'no-store' });
      if (res.ok) setStatus(await res.json() as AiStatus);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function handleRemove() {
    if (!confirm('Remove the AI API key? The AI Assistant will stop working.')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (!res.ok) { toast.error('Could not remove key.'); return; }
      toast.success('AI key removed.');
      await loadStatus();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">AI Assistant Key</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  OpenAI or Anthropic key used by the AI Assistant, Lead Finder, and reply drafting.
                  {' '}You can also set <code className="text-[11px]">OPENAI_API_KEY</code> in your environment instead.
                </CardDescription>
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-2">
                {status?.has_key && (
                  <Button variant="outline" size="sm"
                    className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                    onClick={handleRemove} disabled={removing}>
                    {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Remove
                  </Button>
                )}
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  {status?.has_key ? <><Pencil className="size-3.5" /> Edit Key</> : <><Plus className="size-3.5" /> Add Key</>}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : status?.has_key ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-green-500" />
                <span className="text-sm text-foreground font-medium">Key configured</span>
              </div>
              {status.provider && (
                <Badge className="border-border bg-muted text-muted-foreground text-[10px] capitalize">
                  {status.provider === 'openai' ? 'OpenAI' : status.provider === 'anthropic' ? 'Anthropic' : 'Google Gemini'}
                </Badge>
              )}
              {status.model && (
                <Badge className="border-border bg-muted text-muted-foreground text-[10px]">
                  {status.model}
                </Badge>
              )}
              {status.is_active && (
                <Badge className="border-green-500/40 bg-green-500/10 text-green-400 text-[10px]">Active</Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="size-4" />
              No AI key configured. Add your OpenAI or Anthropic key to enable the AI Assistant.
            </div>
          )}
        </CardContent>
      </Card>

      <AiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentProvider={status?.provider}
        currentModel={status?.model}
        hasKey={status?.has_key ?? false}
        onSaved={loadStatus}
      />
    </>
  );
}

function AiKeyDialog({
  open, onOpenChange, currentProvider, currentModel, hasKey, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentProvider?: AiProvider;
  currentModel?: string;
  hasKey: boolean;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<AiProvider>(currentProvider ?? 'openai');
  const [model, setModel] = useState(currentModel ?? 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  // Step 1 = form, Step 2 = confirm
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [saving, setSaving] = useState(false);

  function reset() {
    setApiKey('');
    setShowKey(false);
    setStep('form');
    setSaving(false);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleProviderChange(p: AiProvider) {
    setProvider(p);
    if (p === 'openai') setModel('gpt-4o-mini');
    else if (p === 'anthropic') setModel('claude-haiku-4-5-20251001');
    else setModel('gemini-1.5-flash-latest');
  }

  function handleNext() {
    const trimmed = apiKey.trim();
    if (!trimmed) { toast.error('Please enter an API key.'); return; }
    if (provider === 'openai' && !trimmed.startsWith('sk-')) {
      toast.error('OpenAI keys start with "sk-".');
      return;
    }
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
      toast.error('Anthropic keys start with "sk-ant-".');
      return;
    }
    if (provider === 'gemini' && !trimmed.startsWith('AI')) {
      toast.error('Google Gemini keys typically start with "AI".');
      return;
    }
    setStep('confirm');
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, api_key: apiKey.trim(), is_active: true }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed to save AI key.'); return; }
      toast.success('AI key saved. The AI Assistant is now ready.');
      onSaved();
      handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const modelOptions: Record<AiProvider, { value: string; label: string }[]> = {
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini (fast, cheap)' },
      { value: 'gpt-4o', label: 'GPT-4o (most capable)' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    anthropic: [
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast, cheap)' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet (balanced)' },
    ],
    gemini: [
      { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash (fast, free tier)' },
      { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro (most capable)' },
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (experimental)' },
    ],
  };

  const maskedKey = apiKey.trim()
    ? apiKey.slice(0, 8) + '••••••••••••' + apiKey.slice(-4)
    : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {hasKey ? 'Update AI Key' : 'Add AI Assistant Key'}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {hasKey
                  ? 'Enter a new key to replace the existing one.'
                  : 'Configure an OpenAI or Anthropic key to power the AI Assistant, Lead Finder, and reply drafting.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Provider</Label>
                <Select value={provider} onValueChange={(v) => handleProviderChange(v as AiProvider)}>
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Default Model</Label>
                <Select value={model} onValueChange={(v) => { if (v) setModel(v); }}>
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions[provider].map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  API Key{provider === 'openai' ? ' (starts with sk-)' : provider === 'anthropic' ? ' (starts with sk-ant-)' : ' (Google AI Studio key)'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'AIza...'}
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button type="button" variant="outline" size="icon"
                    onClick={() => setShowKey((v) => !v)}
                    className="shrink-0 border-border">
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Alternatively, set <code className="text-[11px]">OPENAI_API_KEY</code>, <code className="text-[11px]">ANTHROPIC_API_KEY</code>, or <code className="text-[11px]">GEMINI_API_KEY</code> in your <code className="text-[11px]">.env</code> file — the server will pick it up automatically.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}
                className="border-border text-muted-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button onClick={handleNext} disabled={!apiKey.trim()}>
                Review & Confirm →
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Confirm AI Key</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Review the details below before saving. Click Edit to make changes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-medium text-foreground capitalize">
                  {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic (Claude)' : 'Google Gemini'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono text-xs text-foreground">{model}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">API Key</span>
                <span className="font-mono text-xs text-foreground">{maskedKey}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge className="border-green-500/40 bg-green-500/10 text-green-400 text-[10px]">Active</Badge>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep('form')}
                className="border-border text-muted-foreground hover:bg-muted">
                <Pencil className="size-3.5" /> Edit
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="size-4" /> Confirm & Save</>}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Create dialog — form → one-time plaintext reveal.
// ------------------------------------------------------------

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('Settings.apiKeys');
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Once set, we switch from the form to the reveal view.
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  function reset() {
    setName('');
    setScopes([]);
    setSubmitting(false);
    setCreatedKey(null);
  }

  function toggleScope(scope: ApiScope, checked: boolean) {
    setScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((s) => s !== scope)
    );
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, scopes }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || t('createError'));
        return;
      }
      setCreatedKey(payload.plaintext as string);
      onCreated();
    } catch (err) {
      console.error('[CreateKeyDialog] create error:', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success(t('copySuccess'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover sm:max-w-md">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {t('copyTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('copyDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground">{t('apiKeyLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdKey}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={copyKey}>
                  <Copy className="size-4" />
                  {t('copy')}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {t('newKeyTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('newKeyDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-key-name" className="text-muted-foreground">
                  {t('nameLabel')}
                </Label>
                <Input
                  id="api-key-name"
                  value={name}
                  maxLength={80}
                  placeholder={t('namePlaceholder')}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('scopesLabel')}</Label>
                <div className="border-border space-y-2 rounded-md border p-3">
                  {API_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className="flex cursor-pointer items-start gap-2.5"
                    >
                      <Checkbox
                        checked={scopes.includes(scope)}
                        onCheckedChange={(checked) =>
                          toggleScope(scope, checked === true)
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-foreground block font-mono text-xs">
                          {scope}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {SCOPE_DESCRIPTIONS[scope]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t.rich('scopesHint', {
                    code: (chunks: React.ReactNode) => (
                      <code className="text-[11px]">{chunks}</code>
                    ),
                  })}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  t('createKey')
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
