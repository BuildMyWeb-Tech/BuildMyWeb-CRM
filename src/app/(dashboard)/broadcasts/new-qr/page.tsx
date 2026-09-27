'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { QrStep1Recipients, type SelectedContact } from '@/components/broadcasts/qr-step1-recipients';
import { QrStep2Compose, type MediaAttachment } from '@/components/broadcasts/qr-step2-compose';
import { QrStep3Review } from '@/components/broadcasts/qr-step3-review';

const STEPS = [
  { label: 'Recipients', key: 'recipients' },
  { label: 'Message', key: 'message' },
  { label: 'Review & Send', key: 'review' },
] as const;

export default function NewQrBroadcastPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<SelectedContact[]>([]);
  const [messageText, setMessageText] = useState('');
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSend({
    scheduledAt,
    sendIntervalMs,
    broadcastName,
  }: {
    scheduledAt: Date | null;
    sendIntervalMs: number;
    broadcastName: string;
  }) {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/whatsapp/broadcast/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: broadcastName,
          contact_ids: selected.map((c) => c.id),
          message_text: messageText,
          scheduled_at: scheduledAt?.toISOString() ?? null,
          send_interval_ms: sendIntervalMs,
          media_url: media?.url ?? null,
          media_type: media?.type ?? null,
          media_filename: media?.filename ?? null,
          media_mimetype: media?.mimetype ?? null,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error ?? `Failed to create broadcast (HTTP ${res.status})`);
        return;
      }

      const { broadcastId, totalRecipients, status } = payload as {
        broadcastId: string;
        totalRecipients: number;
        status: string;
      };

      if (status === 'queued' && !scheduledAt) {
        toast.success(`Broadcast queued for ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}. Worker will deliver shortly.`);
      } else {
        toast.success(`Broadcast scheduled for ${totalRecipients} recipient${totalRecipients !== 1 ? 's' : ''}.`);
      }
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unexpected error creating broadcast.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New QR Broadcast</h1>
          <p className="text-sm text-muted-foreground">
            Send a WhatsApp message to multiple contacts via your connected device.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
                    isDone
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'border border-border bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'hidden text-sm font-medium sm:block',
                    isActive
                      ? 'text-foreground'
                      : isDone
                        ? 'text-primary'
                        : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-px flex-1',
                    i < step ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {step === 0 && (
          <QrStep1Recipients
            selected={selected}
            onSelectionChange={setSelected}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <QrStep2Compose
            recipients={selected}
            messageText={messageText}
            media={media}
            onMessageChange={setMessageText}
            onMediaChange={setMedia}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <QrStep3Review
            recipients={selected}
            messageText={messageText}
            media={media}
            onBack={() => setStep(1)}
            onSend={handleSend}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}
