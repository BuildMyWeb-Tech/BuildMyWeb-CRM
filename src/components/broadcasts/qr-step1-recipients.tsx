'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { normalizePhone, isValidE164 } from '@/lib/whatsapp/phone-utils';
import { Search, Users, AlertTriangle, Check, X, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

export interface SelectedContact {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  hasValidPhone: boolean;
}

interface Props {
  selected: SelectedContact[];
  onSelectionChange: (contacts: SelectedContact[]) => void;
  onNext: () => void;
}

function buildSelected(contact: Contact): SelectedContact {
  const raw = contact.phone ?? '';
  const normalized = normalizePhone(raw);
  return {
    id: contact.id,
    name: contact.name ?? contact.phone ?? 'Unknown',
    phone: raw,
    normalizedPhone: normalized,
    hasValidPhone: isValidE164(normalized),
  };
}

export function QrStep1Recipients({ selected, onSelectionChange, onNext }: Props) {
  const { accountId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('contacts')
      .select('id, name, phone, email, company')
      .eq('account_id', accountId)
      .order('name', { ascending: true })
      .limit(1000)
      .then(({ data }) => {
        setContacts((data ?? []) as Contact[]);
        setLoading(false);
      });
  }, [accountId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  // Track deduplicated phone numbers to prevent adding two contacts with same phone.
  const selectedPhones = useMemo(
    () => new Set(selected.map((s) => s.normalizedPhone).filter(Boolean)),
    [selected],
  );

  const validCount = selected.filter((s) => s.hasValidPhone).length;
  const invalidCount = selected.length - validCount;
  // Phone-duplicate contacts already in selection.
  const dupPhoneCount = useMemo(() => {
    const seen = new Set<string>();
    let dups = 0;
    for (const s of selected) {
      if (!s.hasValidPhone) continue;
      if (seen.has(s.normalizedPhone)) dups++;
      else seen.add(s.normalizedPhone);
    }
    return dups;
  }, [selected]);
  const willSendCount = validCount - dupPhoneCount;

  function toggle(contact: Contact) {
    const s = buildSelected(contact);
    if (selectedIds.has(s.id)) {
      onSelectionChange(selected.filter((c) => c.id !== s.id));
    } else {
      onSelectionChange([...selected, s]);
    }
  }

  function selectAllFiltered() {
    const existing = new Map(selected.map((c) => [c.id, c]));
    for (const c of filtered) {
      if (!existing.has(c.id)) {
        existing.set(c.id, buildSelected(c));
      }
    }
    onSelectionChange([...existing.values()]);
  }

  function clearAll() {
    onSelectionChange([]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Select Recipients</h2>
        <p className="text-sm text-muted-foreground">
          Choose the CRM contacts to include in this broadcast.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, phone or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{filtered.length} contact{filtered.length !== 1 ? 's' : ''} visible</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllFiltered}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Select all visible
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Contact list */}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading contacts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No contacts match your search.
          </div>
        ) : (
          filtered.map((contact) => {
            const s = buildSelected(contact);
            const isSelected = selectedIds.has(contact.id);
            const isDupPhone =
              !isSelected &&
              s.hasValidPhone &&
              selectedPhones.has(s.normalizedPhone);

            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => toggle(contact)}
                disabled={isDupPhone}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-0',
                  isSelected
                    ? 'bg-primary/5'
                    : isDupPhone
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-muted/50',
                )}
              >
                <div
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    isSelected
                      ? 'border-primary bg-primary'
                      : 'border-border bg-transparent',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {contact.name ?? 'Unnamed'}
                    </span>
                    {!s.hasValidPhone && (
                      <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                        No phone
                      </span>
                    )}
                    {isDupPhone && (
                      <span className="shrink-0 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">
                        Dup phone
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{contact.phone ?? '—'}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Selection summary + warning */}
      {selected.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Selection summary</span>
            <span className="text-muted-foreground">{selected.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-green-500">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {willSendCount} will receive the broadcast
            </div>
            {invalidCount > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                {invalidCount} will be skipped (no valid phone)
              </div>
            )}
            {dupPhoneCount > 0 && (
              <div className="flex items-center gap-1.5 text-orange-400">
                <div className="h-2 w-2 rounded-full bg-orange-400" />
                {dupPhoneCount} skipped (duplicate phone)
              </div>
            )}
          </div>
          {(invalidCount > 0 || dupPhoneCount > 0) && (
            <div className="flex items-start gap-2 rounded-md bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {invalidCount + dupPhoneCount} contact{invalidCount + dupPhoneCount !== 1 ? 's' : ''} will be skipped.
                Messages will be sent to {willSendCount} recipient{willSendCount !== 1 ? 's' : ''}.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={willSendCount === 0}
          onClick={onNext}
          className={cn(
            'rounded-lg px-5 py-2 text-sm font-medium transition-colors',
            willSendCount > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          Continue with {willSendCount} recipient{willSendCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
