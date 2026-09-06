'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { TopTabs } from '@/components/settings/top-tabs';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { GoogleDriveSettings } from '@/components/google-drive/google-drive-settings';
import {
  SECTION_META,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// Settings covers personal sections (Overview, Your profile, Login &
// security, Appearance) PLUS the account-wide "Organization" sections
// that moved back here from Workspace (Deals & currency, Team
// members, API keys, Google Drive) — Workspace keeps only its
// WhatsApp-flavored sections (WhatsApp, Templates, Quick replies,
// Fields & tags). Overview still surfaces Workspace items as cards;
// clicking one routes over to /workspace?tab=X via sectionHref()
// below, while an Organization or Account item stays on this page.
//
// Top tab bar replaces the old left-rail sub-nav (SettingsRail) —
// that component is left in place, just unused by this page, in
// case anything else still references it.

type LocalSection = 'overview' | 'profile' | 'security' | 'appearance' | 'deals' | 'members' | 'api' | 'google-drive';
const LOCAL_SECTIONS: LocalSection[] = [
  'overview',
  'profile',
  'security',
  'appearance',
  'deals',
  'members',
  'api',
  'google-drive',
];

function isLocalSection(value: string | null): value is LocalSection {
  return !!value && (LOCAL_SECTIONS as string[]).includes(value);
}

function resolveLocalSection(raw: string | null): LocalSection {
  return isLocalSection(raw) ? raw : 'overview';
}

/** Where an Overview card click should land — this page if it's a
 * personal section, /workspace if it's an account-wide one. */
function sectionHref(section: SettingsSection): string {
  const meta = SECTION_META[section];
  if (meta.group === 'workspace') return `/workspace?tab=${section}`;
  return `/settings?tab=${section}`;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('Settings');

  const section = resolveLocalSection(searchParams.get('tab'));

  const go = (next: LocalSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const handleOverviewSelect = (target: SettingsSection) => {
    const href = sectionHref(target);
    if (href.startsWith('/settings')) {
      go(target as LocalSection);
    } else {
      router.push(href);
    }
  };

  const tabs = useMemo(
    () =>
      LOCAL_SECTIONS.map((id) => ({
        id,
        label: SECTION_META[id].label,
        icon: SECTION_META[id].icon,
      })),
    [],
  );

  const panel: Record<LocalSection, ReactNode> = {
    overview: <SettingsOverview onSelect={handleOverviewSelect} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
    'google-drive': <GoogleDriveSettings />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pageDesc')}
        </p>
      </div>

      <div className="mt-4">
        <TopTabs tabs={tabs} active={section} onSelect={go} />
      </div>

      <div className="mt-6 min-w-0">{panel[section]}</div>
    </div>
  );
}
