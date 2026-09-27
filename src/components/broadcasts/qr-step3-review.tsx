'use client';

import { useState } from 'react';
import { Calendar, Clock, Send, Loader2, Users, MessageSquare, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectedContact } from './qr-step1-recipients';
import type { MediaAttachment } from './qr-step2-compose';

const MIN_INTERVAL_MS = 500;
const DEFAULT_INTERVAL_MS = 1000;

interface Props {
  recipients: SelectedContact[];
  messageText: string;
  media: MediaAttachment | null;
  onBack: () => void;
  onSend: (opts: {
    scheduledAt: Date | null;
    sendIntervalMs: number;
    broadcastName: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QrStep3Review({
  recipients,
  messageText,
  media,
  onBack,
  onSend,
  isSubmitting,
}: Props) {
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDateStr, setScheduledDateStr] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    return toLocalDatetimeValue(d);
  });
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_MS / 1000);
  const [broadcastName, setBroadcastName] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const validRecipients = recipients.filter((r) => r.hasValidPhone);
  // Deduplicate by normalized phone
  const uniquePhones = new Set(validRecipients.map((r) => r.normalizedPhone));
  const willSendCount = uniquePhones.size;

  function validateSchedule(): Date | null {
    setScheduleError(null);
    if (sendMode === 'now') return null;

    if (!scheduledDateStr) {
      setScheduleError('Please select a date and time.');
      return null;
    }
    const d = new Date(scheduledDateStr);
    if (isNaN(d.getTime())) {
      setScheduleError('Invalid date and time.');
      return null;
    }
    if (d.getTime() <= Date.now() + 30_000) {
      setScheduleError('Scheduled time must be at least 30 seconds in the future.');
      return null;
    }
    return d;
  }

  function validateInterval(): number | null {
    const ms = Math.round(intervalSec * 1000);
    if (ms < MIN_INTERVAL_MS) {
      return null;
    }
    return ms;
  }

  async function handleSubmit() {
    const scheduledAt = sendMode === 'now' ? null : validateSchedule();
    if (sendMode === 'scheduled' && scheduledAt === null) return; // error set

    const sendIntervalMs = validateInterval();
    if (sendIntervalMs === null) return;

    await onSend({
      scheduledAt,
      sendIntervalMs,
      broadcastName: broadcastName.trim() || generateDefaultName(),
    });
  }

  function generateDefaultName(): string {
    const now = new Date();
    return `QR Broadcast ${now.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const minDatetime = toLocalDatetimeValue(new Date(Date.now() + 60_000));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review & Send</h2>
        <p className="text-sm text-muted-foreground">
          Review your broadcast details before sending.
        </p>
      </div>

      {/* Broadcast name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Broadcast name (optional)</label>
        <input
          type="text"
          value={broadcastName}
          onChange={(e) => setBroadcastName(e.target.value)}
          placeholder={generateDefaultName()}
          className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Summary cards */}
      <div className="space-y-2">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Recipients</p>
            <p className="text-muted-foreground">{willSendCount} contact{willSendCount !== 1 ? 's' : ''} will receive this broadcast</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium text-foreground">Message</p>
            <p className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-muted-foreground text-xs">
              {messageText}
            </p>
          </div>
        </div>

        {media && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {media.type === 'video' ? 'Video' : 'Image'} attachment
              </p>
              <p className="text-muted-foreground">{media.filename}</p>
              {media.caption && (
                <p className="text-xs text-muted-foreground/70">Caption: {media.caption}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send timing */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">When to send</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSendMode('now')}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
              sendMode === 'now'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <Send className="h-4 w-4" />
            Send now
          </button>
          <button
            type="button"
            onClick={() => setSendMode('scheduled')}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
              sendMode === 'scheduled'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <Calendar className="h-4 w-4" />
            Schedule
          </button>
        </div>

        {sendMode === 'scheduled' && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Date &amp; time (local timezone)
            </label>
            <input
              type="datetime-local"
              value={scheduledDateStr}
              min={minDatetime}
              onChange={(e) => { setScheduledDateStr(e.target.value); setScheduleError(null); }}
              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            {scheduleError && (
              <p className="text-xs text-red-400">{scheduleError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              The broadcast will start processing at this time. Your browser can close after scheduling.
            </p>
          </div>
        )}
      </div>

      {/* Send interval */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Sending interval (seconds between messages)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={intervalSec}
            onChange={(e) => setIntervalSec(parseFloat(e.target.value) || 1)}
            className="w-24 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-xs text-muted-foreground">
            Minimum 0.5 s · Default 1 s · Higher values reduce delivery speed
          </span>
        </div>
        {intervalSec * 1000 < MIN_INTERVAL_MS && (
          <p className="text-xs text-red-400">Minimum interval is 0.5 seconds.</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          disabled={isSubmitting || willSendCount === 0 || intervalSec * 1000 < MIN_INTERVAL_MS}
          onClick={handleSubmit}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
            !isSubmitting && willSendCount > 0 && intervalSec * 1000 >= MIN_INTERVAL_MS
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : sendMode === 'now' ? (
            <>
              <Send className="h-4 w-4" />
              Send broadcast
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Schedule broadcast
            </>
          )}
        </button>
      </div>
    </div>
  );
}
