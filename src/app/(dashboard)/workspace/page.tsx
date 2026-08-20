'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { TopTabs } from '@/components/settings/top-tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { SECTION_META } from '@/components/settings/settings-sections';

// Workspace — everything account-wide that used to live under
// Settings' "Workspace" rail group: WhatsApp, Templates, Quick
// replies, Fields & tags, Deals & currency, Team members, API keys.
// Settings itself now covers only personal sections (Overview, Your
// profile, Login & security, Appearance) — see settings/page.tsx.
// Its Overview cards for these sections route here via ?tab=.

type WorkspaceSection =
  | 'whatsapp'
  | 'templates'
  | 'quick-replies'
  | 'fields'
  | 'deals'
  | 'members'
  | 'api';

const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  'whatsapp',
  'templates',
  'quick-replies',
  'fields',
  'deals',
  'members',
  'api',
];

function isWorkspaceSection(value: string | null): value is WorkspaceSection {
  return !!value && (WORKSPACE_SECTIONS as string[]).includes(value);
}

function resolveWorkspaceSection(raw: string | null): WorkspaceSection {
  // Legacy values from the pre-split Settings tab, same mapping
  // resolveSection() used to do.
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  return isWorkspaceSection(raw) ? raw : 'whatsapp';
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspacePageInner />
    </Suspense>
  );
}

function WorkspacePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const section = resolveWorkspaceSection(searchParams.get('tab'));

  const go = (next: WorkspaceSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/workspace?${params.toString()}`, { scroll: false });
  };

  const tabs = useMemo(
    () =>
      WORKSPACE_SECTIONS.map((id) => ({
        id,
        label: SECTION_META[id].label,
        icon: SECTION_META[id].icon,
      })),
    [],
  );

  const panel: Record<WorkspaceSection, ReactNode> = {
    whatsapp: <WhatsAppConfig />,
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account-wide configuration — WhatsApp, templates, team, and more.
        </p>
      </div>

      <div className="mt-4">
        <TopTabs tabs={tabs} active={section} onSelect={go} />
      </div>

      <div className="mt-6 min-w-0">{panel[section]}</div>
    </div>
  );
}
