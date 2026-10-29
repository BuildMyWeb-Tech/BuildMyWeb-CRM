'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2, AlertTriangle, RefreshCw, Search, Trash2, Download } from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { InlineQrWizard } from '@/components/broadcasts/inline-qr-wizard';
import { InlineCloudWizard } from '@/components/broadcasts/inline-cloud-wizard';

type InlineView = 'list' | 'new-qr' | 'new';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;



export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');
  const [inlineView, setInlineView] = useState<InlineView>('list');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrOffline, setQrOffline] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BroadcastStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function retryBroadcast(e: React.MouseEvent, broadcastId: string) {
    e.stopPropagation(); // don't navigate to detail
    if (retryingId) return;
    setRetryingId(broadcastId);
    try {
      const res = await fetch('/api/whatsapp/broadcast/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcast_id: broadcastId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error ?? 'Retry failed');
        return;
      }
      if (payload?.workerOffline) {
        toast.warning(`${payload.retried} message${payload.retried !== 1 ? 's' : ''} queued (attempt ${payload.attempt}/${payload.max_retries}) — WhatsApp worker is offline. Reconnect in WhatsApp Connect for messages to deliver.`);
      } else {
        toast.success(`Retrying broadcast — ${payload.retried} message${payload.retried !== 1 ? 's' : ''} queued (attempt ${payload.attempt}/${payload.max_retries})`);
      }
      // Optimistically update status in list and refresh worker state
      setBroadcasts((prev) =>
        prev.map((b) => b.id === broadcastId ? { ...b, status: 'sending' as BroadcastStatus } : b),
      );
      if (payload?.workerOffline) setQrOffline(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setRetryingId(null);
    }
  }

  async function checkQrWorker() {
    try {
      const supabase = createClient();
      const { data: qrAccount } = await supabase
        .from('whatsapp_accounts')
        .select('connection_state, last_heartbeat_at')
        .eq('provider', 'qr')
        .maybeSingle();
      if (!qrAccount) {
        setQrOffline(false);
        return;
      }
      const notConnected = qrAccount.connection_state !== 'CONNECTED';
      const staleHeartbeat =
        !qrAccount.last_heartbeat_at ||
        new Date(qrAccount.last_heartbeat_at).getTime() < Date.now() - 2 * 60 * 1000;
      setQrOffline(notConnected || staleHeartbeat);
    } catch {
      // ignore — non-critical diagnostic
    }
  }

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const currentData = data ?? [];
      const sendingBroadcasts = currentData.filter((b: Broadcast) => b.status === 'sending');

      if (sendingBroadcasts.length === 0) {
        setBroadcasts(currentData);
        return;
      }

      const sendingIds = sendingBroadcasts.map((b: Broadcast) => b.id);

      // Check which sending broadcasts still have pending recipients.
      const { data: pendingRows } = await supabase
        .from('broadcast_recipients')
        .select('broadcast_id')
        .in('broadcast_id', sendingIds)
        .eq('status', 'pending');

      const stillPendingSet = new Set(
        (pendingRows ?? []).map((r: { broadcast_id: string }) => r.broadcast_id),
      );

      // ── Case A: no pending recipients → finalize immediately ─────────────
      const readyToFinalize = sendingBroadcasts.filter(
        (b: Broadcast) => !stillPendingSet.has(b.id),
      );

      // ── Case B: QR worker offline → all outbox rows stuck at 0 attempts ──
      // Use 5-minute threshold so fresh broadcasts get caught on next poll
      // rather than waiting an hour. The worker picks up in seconds when
      // it IS running, so 5 min is a safe signal that it is offline.
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const qrStuckIds = sendingBroadcasts
        .filter((b: Broadcast) => b.provider === 'qr' && stillPendingSet.has(b.id))
        .map((b: Broadcast) => b.id);

      let abandonedIds = new Set<string>();
      if (qrStuckIds.length > 0) {
        // Find outbox rows that are still untouched after 5 minutes.
        const { data: untouched } = await supabase
          .from('whatsapp_message_outbox')
          .select('broadcast_id')
          .in('broadcast_id', qrStuckIds)
          .eq('status', 'pending')
          .eq('attempts', 0)
          .lt('created_at', fiveMinutesAgo);

        // Also confirm no row for that broadcast has attempts > 0
        // (worker started but stalled mid-send — don't cancel those).
        const candidateIds = new Set(
          (untouched ?? []).map((r: { broadcast_id: string }) => r.broadcast_id),
        );

        if (candidateIds.size > 0) {
          const { data: activeRows } = await supabase
            .from('whatsapp_message_outbox')
            .select('broadcast_id')
            .in('broadcast_id', [...candidateIds])
            .gt('attempts', 0);

          const activeSet = new Set(
            (activeRows ?? []).map((r: { broadcast_id: string }) => r.broadcast_id),
          );

          // Only abandon if NO row has been attempted at all.
          for (const id of candidateIds) {
            if (!activeSet.has(id)) abandonedIds.add(id);
          }
        }
      }

      // Nothing to finalize — just render what we have.
      if (readyToFinalize.length === 0 && abandonedIds.size === 0) {
        setBroadcasts(currentData);
        return;
      }

      // ── Optimistic update: flip status in local state immediately ─────────
      // The UI shows the correct status right away; DB writes happen after.
      const updatedLocally: Broadcast[] = currentData.map((b: Broadcast) => {
        if (b.status !== 'sending') return b;
        const shouldFinalize =
          readyToFinalize.some((r: Broadcast) => r.id === b.id) || abandonedIds.has(b.id);
        if (shouldFinalize) {
          const finalStatus: BroadcastStatus = b.sent_count === 0 ? 'failed' : 'sent';
          return { ...b, status: finalStatus };
        }
        return b;
      });
      setBroadcasts(updatedLocally);

      // ── Persist to DB (fire-and-forget, errors logged only) ───────────────
      void (async () => {
        try {
          // Case A: finalize broadcasts with no pending recipients.
          for (const b of readyToFinalize) {
            const finalStatus = b.sent_count === 0 ? 'failed' : 'sent';
            await supabase
              .from('broadcasts')
              .update({ status: finalStatus, updated_at: new Date().toISOString() })
              .eq('id', b.id)
              .eq('status', 'sending');
          }

          // Case B: mark abandoned QR broadcasts failed.
          for (const broadcastId of abandonedIds) {
            await supabase
              .from('whatsapp_message_outbox')
              .update({
                status: 'failed',
                error: 'QR worker offline — message never attempted',
                processed_at: new Date().toISOString(),
              })
              .eq('broadcast_id', broadcastId)
              .eq('status', 'pending')
              .eq('attempts', 0);

            await supabase
              .from('broadcast_recipients')
              .update({ status: 'failed' })
              .eq('broadcast_id', broadcastId)
              .eq('status', 'pending');

            const bc = currentData.find((b: Broadcast) => b.id === broadcastId);
            const finalStatus = bc && bc.sent_count > 0 ? 'sent' : 'failed';
            await supabase
              .from('broadcasts')
              .update({ status: finalStatus, updated_at: new Date().toISOString() })
              .eq('id', broadcastId)
              .eq('status', 'sending');
          }
        } catch (dbErr) {
          console.error('[broadcasts] auto-finalize DB write failed:', dbErr);
        }
      })();

    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
    checkQrWorker();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  const filteredBroadcasts = useMemo(() => broadcasts.filter((b) => {
    const matchesSearch = !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [broadcasts, searchQuery, statusFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredBroadcasts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBroadcasts.map((b) => b.id)));
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    if (!confirm(`Delete ${selectedIds.size} broadcast${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    try {
      const supabase = createClient();
      const { error } = await supabase.from('broadcasts').delete().in('id', ids);
      if (error) throw error;
      setBroadcasts((prev) => prev.filter((b) => !selectedIds.has(b.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} broadcast${ids.length > 1 ? 's' : ''}`);
    } catch {
      toast.error('Some deletes failed — please refresh');
    } finally {
      setBulkDeleting(false);
    }
  }

  function exportAsExcel() {
    const rows = filteredBroadcasts.filter((b) => selectedIds.has(b.id));
    const header = ['Name', 'Recipients', 'Status', 'Date'];
    const lines = [header, ...rows.map((b) => [
      b.name,
      String(b.total_recipients),
      b.status,
      new Date(b.created_at).toLocaleDateString(),
    ])];
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'broadcasts.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  // Inline wizard views — render instead of the list
  if (inlineView === 'new-qr') {
    return (
      <InlineQrWizard
        onCancel={() => setInlineView('list')}
        onSuccess={(id) => { setInlineView('list'); fetchBroadcasts(); router.push(`/broadcasts/${id}`); }}
      />
    );
  }
  if (inlineView === 'new') {
    return (
      <InlineCloudWizard
        onCancel={() => setInlineView('list')}
        onSuccess={(id) => { setInlineView('list'); fetchBroadcasts(); router.push(`/broadcasts/${id}`); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* QR worker offline warning */}
      {qrOffline && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your WhatsApp QR connection is offline. New QR broadcasts will be queued but won&apos;t deliver until you reconnect in{' '}
            <a href="/whatsapp-connect" className="underline hover:text-amber-300">WhatsApp Connect</a>.
          </span>
        </div>
      )}

      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label="Broadcast in progress"
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => setInlineView('new-qr')}
            className="border border-border bg-background text-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            QR Broadcast
          </GatedButton>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => setInlineView('new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      </div>

      {broadcasts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search broadcasts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BroadcastStatus | 'all')}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      )}

      {broadcasts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
          <Radio className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noBroadcastsYet')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('createFirst')}
          </p>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => setInlineView('new')}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      ) : (
        <div className="space-y-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={bulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={exportAsExcel}>
                <Download className="h-3 w-3" />
                Export CSV
              </Button>
              <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <input
                      type="checkbox"
                      checked={filteredBroadcasts.length > 0 && selectedIds.size === filteredBroadcasts.length}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground">{t('table.name')}</TableHead>
                  <TableHead className="hidden text-right text-muted-foreground sm:table-cell">
                    {t('table.recipients')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                  <TableHead className="hidden text-muted-foreground sm:table-cell">{t('table.date')}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBroadcasts.map((broadcast) => {
                  const status = getBroadcastStatus(broadcast.status);
                  return (
                    <TableRow
                      key={broadcast.id}
                      className="cursor-pointer border-border hover:bg-muted/50"
                      onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(broadcast.id)}
                          onChange={() => toggleSelect(broadcast.id)}
                          className="h-3.5 w-3.5 cursor-pointer accent-primary"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {broadcast.name}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                        {broadcast.total_recipients}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}>
                          {status.pulse && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                            </span>
                          )}
                          {tStatus(status.label)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {new Date(broadcast.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {broadcast.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 px-2 text-xs text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
                            disabled={retryingId === broadcast.id}
                            onClick={(e) => retryBroadcast(e, broadcast.id)}
                          >
                            {retryingId === broadcast.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RefreshCw className="h-3 w-3" />}
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
