'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, ImagePlus, Video, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { SelectedContact } from './qr-step1-recipients';

const MAX_TEXT_LENGTH = 4096;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16 MB

const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ACCEPTED_VIDEO = ['video/mp4', 'video/3gpp'];
const ACCEPTED_MIME = [...ACCEPTED_IMAGE, ...ACCEPTED_VIDEO];

function mimeToMediaType(mime: string): 'image' | 'video' {
  return mime.startsWith('video/') ? 'video' : 'image';
}

export interface MediaAttachment {
  url: string;
  type: 'image' | 'video';
  filename: string;
  mimetype: string;
  caption: string;
}

interface Props {
  recipients: SelectedContact[];
  messageText: string;
  media: MediaAttachment | null;
  onMessageChange: (text: string) => void;
  onMediaChange: (media: MediaAttachment | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function QrStep2Compose({
  recipients,
  messageText,
  media,
  onMessageChange,
  onMediaChange,
  onNext,
  onBack,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = messageText.trim();
  const canNext = trimmed.length > 0 && trimmed.length <= MAX_TEXT_LENGTH;
  const validCount = recipients.filter((r) => r.hasValidPhone).length;

  async function handleFile(file: File) {
    setUploadError(null);

    if (!ACCEPTED_MIME.includes(file.type)) {
      setUploadError(`Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, GIF, MP4, or 3GPP.`);
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 16 MB.`);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `broadcast-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
      if (!urlData?.publicUrl) throw new Error('Could not get public URL after upload.');

      onMediaChange({
        url: urlData.publicUrl,
        type: mimeToMediaType(file.type),
        filename: file.name,
        mimetype: file.type,
        caption: media?.caption ?? '',
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function removeMedia() {
    onMediaChange(null);
    setUploadError(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Compose Message</h2>
        <p className="text-sm text-muted-foreground">
          This message will be sent to {validCount} recipient{validCount !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Message text area */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquare className="h-4 w-4" />
          Message
        </label>
        <textarea
          value={messageText}
          onChange={(e) => onMessageChange(e.target.value)}
          rows={5}
          placeholder="Type your message here…"
          maxLength={MAX_TEXT_LENGTH}
          className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{trimmed.length === 0 ? 'Required' : ''}</span>
          <span className={cn(messageText.length > MAX_TEXT_LENGTH * 0.9 ? 'text-orange-400' : '')}>
            {messageText.length} / {MAX_TEXT_LENGTH}
          </span>
        </div>
      </div>

      {/* Media attachment */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ImagePlus className="h-4 w-4" />
          Media (optional)
        </label>

        {media ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                {media.type === 'video' ? (
                  <Video className="h-5 w-5 text-muted-foreground" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.url}
                    alt="attachment preview"
                    className="h-12 w-12 rounded-md object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{media.filename}</span>
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={media.caption}
                  onChange={(e) =>
                    onMediaChange({ ...media, caption: e.target.value })
                  }
                  placeholder="Add a caption (optional)"
                  className="w-full rounded border border-border bg-muted/40 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Click or drag & drop an image or video
                </p>
                <p className="text-xs text-muted-foreground/70">
                  JPEG, PNG, WebP, GIF, MP4, 3GPP · max 16 MB
                </p>
              </>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_MIME.join(',')}
          className="hidden"
          onChange={handleInputChange}
        />

        {uploadError && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{uploadError}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canNext || uploading}
          onClick={onNext}
          className={cn(
            'rounded-lg px-5 py-2 text-sm font-medium transition-colors',
            canNext && !uploading
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          Review &amp; Send
        </button>
      </div>
    </div>
  );
}
