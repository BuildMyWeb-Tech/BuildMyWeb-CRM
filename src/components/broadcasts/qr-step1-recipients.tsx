'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { normalizePhone, isValidE164 } from '@/lib/whatsapp/phone-utils';
import { Users, AlertTriangle, Check, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

export interface SelectedContact {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  hasValidPhone: boolean;
}

interface Campaign {
  name: string;
  count: number;
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('contacts')
      .select('campaign_name')
      .eq('account_id', accountId)
      .not('campaign_name', 'is', null)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const row of data ?? []) {
          if (row.campaign_name) map.set(row.campaign_name, (map.get(row.campaign_name) ?? 0) + 1);
        }
        setCampaigns([...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));
        setLoadingCampaigns(false);
      });
  }, [accountId]);

  async function selectCampaign(name: string) {
    setSelectedCampaign(name);
    setLoadingContacts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone, email, company')
      .eq('account_id', accountId!)
      .eq('campaign_name', name)
      .order('name', { ascending: true })
      .limit(2000);
    const contacts = (data ?? []) as Contact[];
    onSelectionChange(contacts.map(buildSelected));
    setLoadingContacts(false);
  }

  function clearSelection() {
    setSelectedCampaign(null);
    onSelectionChange([]);
  }

  const validCount = selected.filter((s) => s.hasValidPhone).length;
  const invalidCount = selected.length - validCount;
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Select Campaign</h2>
        <p className="text-sm text-muted-foreground">
          Pick a campaign — all its contacts will be loaded as recipients.
        </p>
      </div>

      {/* Campaign list */}
      <div className="rounded-lg border border-border overflow-hidden">
        {loadingCampaigns ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No campaigns found. Use Lead Sourcing to create one.
          </div>
        ) : (
          campaigns.map((c) => {
            const isSelected = selectedCampaign === c.name;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => isSelected ? clearSelection() : selectCampaign(c.name)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-0',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
                )}
              >
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}>
                  {isSelected ? <Check className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count} contact{c.count !== 1 ? 's' : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </div>

      {/* Loading contacts */}
      {loadingContacts && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading contacts for campaign…
        </div>
      )}

      {/* Selection summary */}
      {selected.length > 0 && !loadingContacts && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Campaign: {selectedCampaign}</span>
            <span className="text-muted-foreground">{selected.length} contacts loaded</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-green-500">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {willSendCount} will receive the broadcast
            </div>
            {invalidCount > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                {invalidCount} skipped (no valid phone)
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
              <span>Messages will be sent to {willSendCount} recipient{willSendCount !== 1 ? 's' : ''}.</span>
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
