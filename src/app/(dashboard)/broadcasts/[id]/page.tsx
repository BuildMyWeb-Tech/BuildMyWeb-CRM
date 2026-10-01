'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Loader2,
  Users,
  Send,
  AlertCircle,
  Filter,
  Download,
  ChevronDown,
  PlayCircle,
  RotateCcw,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getBroadcastStatus,
  getRecipientStatus,
} from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Funnel</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {step.label}
              </span>
              <div className="relative h-7 flex-1 rounded-full bg-muted">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-muted-foreground/80">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
  'cancelled',
];

/**
 * CSV export helper — RFC 4180 quoting. Quote every field so
 * commas/newlines/quotes round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Broadcasts.detail');
  const tStatus = useTranslations('Broadcasts.status');
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all',
  );
  const [resumingScope, setResumingScope] = useState<
    'pending' | 'failed' | null
  >(null);
  // QR broadcast controls (Phase H)
  const [qrAction, setQrAction] = useState<'pausing' | 'resuming' | 'cancelling' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data: bc, error: bcError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (bcError) throw bcError;

      // Auto-finalize if stuck in "sending".
      if (bc?.status === 'sending') {
        const { count: pendingCount } = await supabase
          .from('broadcast_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending');

        if ((pendingCount ?? 0) === 0) {
          // Case A: all recipients are in a terminal state — finalize now.
          const finalStatus = bc.sent_count === 0 ? 'failed' : 'sent';
          bc.status = finalStatus; // optimistic
          void supabase
            .from('broadcasts')
            .update({ status: finalStatus, updated_at: new Date().toISOString() })
            .eq('id', broadcastId)
            .eq('status', 'sending');
        } else if (bc.provider === 'qr') {
          // Case B: QR worker was offline — 5-minute threshold so the detail
          // page catches abandoned broadcasts on the first or second poll.
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: untouched } = await supabase
            .from('whatsapp_message_outbox')
            .select('id')
            .eq('broadcast_id', broadcastId)
            .eq('status', 'pending')
            .eq('attempts', 0)
            .lt('created_at', fiveMinutesAgo)
            .limit(1);

          if (untouched && untouched.length > 0) {
            // Confirm no row has been attempted (worker didn't stall mid-send).
            const { count: activeCount } = await supabase
              .from('whatsapp_message_outbox')
              .select('id', { count: 'exact', head: true })
              .eq('broadcast_id', broadcastId)
              .gt('attempts', 0);

            if ((activeCount ?? 0) === 0) {
              const finalStatus = bc.sent_count > 0 ? 'sent' : 'failed';
              bc.status = finalStatus; // optimistic — UI updates before DB write
              void (async () => {
                await supabase
                  .from('whatsapp_message_outbox')
                  .update({ status: 'failed', error: 'QR worker offline — message never attempted', processed_at: new Date().toISOString() })
                  .eq('broadcast_id', broadcastId)
                  .eq('status', 'pending')
                  .eq('attempts', 0);
                await supabase
                  .from('broadcast_recipients')
                  .update({ status: 'failed' })
                  .eq('broadcast_id', broadcastId)
                  .eq('status', 'pending');
                await supabase
                  .from('broadcasts')
                  .update({ status: finalStatus, updated_at: new Date().toISOString() })
                  .eq('id', broadcastId)
                  .eq('status', 'sending');
              })();
            }
          }
        }
      }

      setBroadcast(bc);

      const { data: recs, error: recsError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: false });

      if (recsError) throw recsError;
      setRecipients(recs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notFound'));
    } finally {
      setLoading(false);
    }
  }, [broadcastId, t]);

  // Poll while broadcast is active (sending or paused — paused can resume at any time).
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const DETAIL_POLL_MS = 5_000;

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const isActive = broadcast?.status === 'sending' || broadcast?.status === 'paused' || broadcast?.status === 'scheduled';
    function stop() {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    }
    if (isActive && document.visibilityState === 'visible') {
      if (!pollTimer.current) pollTimer.current = setInterval(fetchData, DETAIL_POLL_MS);
    } else {
      stop();
    }
    const onVisibility = () => {
      if (!isActive) return;
      if (document.visibilityState === 'hidden') { stop(); }
      else { fetchData(); if (!pollTimer.current) pollTimer.current = setInterval(fetchData, DETAIL_POLL_MS); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [broadcast?.status, fetchData]);

  const filteredRecipients = useMemo(
    () =>
      statusFilter === 'all'
        ? recipients
        : recipients.filter((r) => r.status === statusFilter),
    [recipients, statusFilter],
  );

  function handleExport() {
    if (!broadcast) return;
    const header = [
      t('table.contact'),
      t('table.phone'),
      t('table.status'),
      t('table.sent'),
      t('table.delivered'),
      t('table.read'),
      t('table.error'),
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadBlob(`broadcast-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  /**
   * Hand the leftovers to the server (issue #472).
   *
   * The wizard's send loop lives in the tab that started the campaign,
   * so navigating away strands the rest as 'pending' with the broadcast
   * stuck 'sending'. This is the recovery, and the same call retries
   * failed recipients.
   */
  async function handleResume(scope: 'pending' | 'failed') {
    setResumingScope(scope);
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          t('toastResumeFailed', {
            error: payload?.error || `HTTP ${res.status}`,
          }),
        );
        return;
      }

      toast.success(
        payload.remaining > 0
          ? t('toastResumeStartedCapped', {
              count: payload.resuming,
              remaining: payload.remaining,
            })
          : t('toastResumeStarted', { count: payload.resuming }),
      );
      // Delivery runs server-side after the 202, so the counts here are
      // a snapshot — reload to pick up the first of it.
      await fetchData();
    } catch (err) {
      toast.error(
        t('toastResumeFailed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
    } finally {
      setResumingScope(null);
    }
  }

  // ── QR broadcast controls ────────────────────────────────────────────────

  async function handleQrPause() {
    setQrAction('pausing');
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/pause`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(payload?.error ?? 'Failed to pause broadcast.'); return; }
      toast.success('Broadcast paused. No new messages will be sent.');
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause broadcast.');
    } finally {
      setQrAction(null);
    }
  }

  async function handleQrResume() {
    setQrAction('resuming');
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/resume`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(payload?.error ?? 'Failed to resume broadcast.'); return; }
      toast.success('Broadcast resumed. The worker will continue sending.');
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resume broadcast.');
    } finally {
      setQrAction(null);
    }
  }

  async function handleQrCancel() {
    setQrAction('cancelling');
    setConfirmCancel(false);
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/cancel`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(payload?.error ?? 'Failed to cancel broadcast.'); return; }
      toast.success('Broadcast cancelled. All pending messages have been stopped.');
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel broadcast.');
    } finally {
      setQrAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? t('notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {t('backToBroadcasts')}
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const pendingCount = recipients.filter((r) => r.status === 'pending').length;
  const retryableCount = recipients.filter((r) => r.status === 'failed').length;
  // A campaign whose tab went away sits in 'sending' with recipients
  // still pending and nothing left to move them. Name that state rather
  // than leaving a permanently pulsing "sending" badge.
  const isStalled = broadcast.status === 'sending' && pendingCount > 0;

  const funnelSteps: FunnelStep[] = [
    { label: t('stats.sent'), value: broadcast.sent_count, color: 'bg-primary' },
    { label: t('stats.failed'), value: broadcast.failed_count, color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{broadcast.name}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {tStatus(status.label)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {broadcast.template_name ? (
                <span>{t('template', { name: broadcast.template_name })}</span>
              ) : (
                <span>QR broadcast</span>
              )}
              <span>·</span>
              <span>
                {t('createdAt', { date: new Date(broadcast.created_at).toLocaleDateString() })}
              </span>
              {broadcast.scheduled_at && broadcast.status === 'scheduled' && (
                <>
                  <span>·</span>
                  <span className="text-blue-400">
                    Scheduled: {new Date(broadcast.scheduled_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Phase H: QR broadcast pause / resume / cancel controls.
          Only rendered for QR broadcasts with controllable status. */}
      {broadcast.provider === 'qr' &&
        (broadcast.status === 'sending' || broadcast.status === 'paused' || broadcast.status === 'scheduled') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {broadcast.status === 'paused' ? 'Broadcast paused' : 'QR Broadcast controls'}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {broadcast.status === 'sending'
                ? 'Pause to stop sending new messages, or cancel to stop permanently.'
                : broadcast.status === 'paused'
                ? 'Resume to continue sending, or cancel to stop permanently.'
                : 'Broadcast is scheduled. You can cancel it before it starts.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {broadcast.status === 'sending' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleQrPause}
                disabled={qrAction !== null}
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              >
                {qrAction === 'pausing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PauseCircle className="h-3.5 w-3.5" />
                )}
                Pause
              </Button>
            )}
            {broadcast.status === 'paused' && (
              <Button
                size="sm"
                onClick={handleQrResume}
                disabled={qrAction !== null}
              >
                {qrAction === 'resuming' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                Resume
              </Button>
            )}
            {confirmCancel ? (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm">
                <span className="text-red-300">Cancel permanently?</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancel(false)}
                  disabled={qrAction !== null}
                  className="h-7 border-border bg-transparent text-muted-foreground hover:bg-muted"
                >
                  No
                </Button>
                <Button
                  size="sm"
                  onClick={handleQrCancel}
                  disabled={qrAction !== null}
                  className="h-7 bg-red-600 text-white hover:bg-red-700"
                >
                  {qrAction === 'cancelling' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : 'Yes, cancel'}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmCancel(true)}
                disabled={qrAction !== null}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel broadcast
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Resume / retry (issue #472). Only rendered for Meta broadcasts
          where the browser drove sends. QR broadcasts are worker-driven
          and use the pause/resume/cancel panel above instead. */}
      {broadcast.provider !== 'qr' && (pendingCount > 0 || retryableCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {isStalled ? t('resumeStalledTitle') : t('resumeTitle')}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {isStalled
                ? t('resumeStalledHint', { count: pendingCount })
                : t('resumeHint', { count: retryableCount })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={() => handleResume('pending')}
                disabled={resumingScope !== null}
              >
                {resumingScope === 'pending' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                {t('resumePending', { count: pendingCount })}
              </Button>
            )}
            {retryableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResume('failed')}
                disabled={resumingScope !== null}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {resumingScope === 'failed' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {t('retryFailed', { count: retryableCount })}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats — 3 cards: Total / Sent / Failed */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label={t('stats.totalRecipients')}
          value={broadcast.total_recipients}
          total={broadcast.total_recipients}
          icon={<Users className="h-4 w-4" />}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label={t('stats.sent')}
          value={broadcast.sent_count}
          total={broadcast.total_recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label={t('stats.failed')}
          value={broadcast.failed_count}
          total={broadcast.total_recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      <FunnelChart steps={funnelSteps} />

      {/* Recipients Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">
            {statusFilter !== 'all'
              ? t('recipientsHeader', { filtered: filteredRecipients.length, total: recipients.length })
              : t('recipientsHeaderAll', { total: recipients.length })}
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-muted-foreground hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? t('allStatuses')
                  : tStatus(getRecipientStatus(statusFilter).label)}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-popover">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all' ? 'text-primary' : 'text-popover-foreground'
                  }
                >
                  {t('allStatuses')}
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    }
                  >
                    {tStatus(getRecipientStatus(s).label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={recipients.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {t('exportCsv')}
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {recipients.length === 0
                ? t('noRecipients')
                : t('noRecipientsFilter')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t('table.contact')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.phone')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.sent')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.error')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {recipient.contact?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {tStatus(rStatus.label)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-red-400">
                        {recipient.last_error ?? recipient.error_message ?? '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
