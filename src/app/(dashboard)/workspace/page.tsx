'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { TopTabs } from '@/components/settings/top-tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { SECTION_META } from '@/components/settings/settings-sections';

// Workspace — WhatsApp-flavored account config: WhatsApp, Templates,
// Quick replies, Fields & tags. Deals & currency, Team members, API
// keys, and Google Drive moved to Settings (see settings/page.tsx) —
// they're account-wide too, but not part of this page's WhatsApp
// setup flow. Settings itself covers personal sections (Overview,
// Your profile, Login & security, Appearance) plus those four moved
// ones. Its Overview cards for the sections still living here route
// over via ?tab=.

type WorkspaceSection = 'whatsapp' | 'templates' | 'quick-replies' | 'fields';

const WORKSPACE_SECTIONS: WorkspaceSection[] = ['whatsapp', 'templates', 'quick-replies', 'fields'];

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
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          WhatsApp setup — connection, templates, quick replies, and custom fields.
        </p>
      </div>

      <div className="mt-4">
        <TopTabs tabs={tabs} active={section} onSelect={go} />
      </div>

      <div className="mt-6 min-w-0">{panel[section]}</div>
    </div>
  );
}
