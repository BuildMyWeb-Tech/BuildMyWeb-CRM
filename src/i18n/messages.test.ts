import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Locale dictionaries are hand-maintained. English is the source of
// truth (src/i18n/request.ts falls back to en.json only when a whole
// locale file is missing — there is no per-key fallback), so a key
// that lands in en.json and not in a translation renders as a raw
// keypath for users on that locale. This guards the parity.

const MESSAGES_DIR = join(process.cwd(), 'messages');
const SOURCE_LOCALE = 'en';
// BMW CRM ships English-only for now — Korean (messages/ko.json) was
// dropped since it wasn't serving the project. Add locale codes back
// here (and restore/create the matching messages/<locale>.json) if
// multi-language support is ever needed.
const TRANSLATED_LOCALES: string[] = [];

function loadKeys(locale: string): Set<string> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const out = new Set<string>();
  const walk = (node: unknown, path: string) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    out.add(path);
  };
  walk(JSON.parse(raw), '');
  return out;
}

describe('message catalogue parity', () => {
  const source = loadKeys(SOURCE_LOCALE);

  // Guards against `it.each(TRANSLATED_LOCALES)` silently producing
  // zero test cases when the list is empty (BMW CRM ships English-only
  // right now) — Vitest treats a suite with 0 generated tests as a
  // hard failure ("No test found in suite"), not a pass. This test
  // always runs regardless of how many locales are configured, so the
  // file never goes test-less, and it doubles as a sanity check that
  // en.json itself is valid and loadable.
  it('has a loadable source locale', () => {
    expect(source.size).toBeGreaterThan(0);
  });

  it.each(TRANSLATED_LOCALES)('%s.json covers every en.json key', (locale) => {
    const translated = loadKeys(locale);
    const missing = [...source].filter((k) => !translated.has(k)).sort();
    expect(missing, `${locale}.json is missing these keys`).toEqual([]);
  });

  it.each(TRANSLATED_LOCALES)('%s.json has no orphaned keys', (locale) => {
    const translated = loadKeys(locale);
    const orphaned = [...translated].filter((k) => !source.has(k)).sort();
    expect(orphaned, `${locale}.json has keys absent from en.json`).toEqual([]);
  });
});