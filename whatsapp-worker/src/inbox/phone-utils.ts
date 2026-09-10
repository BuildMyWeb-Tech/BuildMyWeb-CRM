/**
 * Phone / JID normalization for the worker's inbound message handler.
 * Must stay in sync with the CRM's src/lib/whatsapp/phone-utils.ts logic.
 */

/** Strip the WhatsApp JID suffix: "919999999999@s.whatsapp.net" → "919999999999" */
export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0]
}

/** Digits only. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** True when two numbers match, tolerating trunk-prefix differences (last-8). */
export function phonesMatch(a: string, b: string): boolean {
  const n1 = normalizePhone(a)
  const n2 = normalizePhone(b)
  if (n1 === n2) return true
  if (n1.length >= 8 && n2.length >= 8) return n1.slice(-8) === n2.slice(-8)
  return false
}

/** True for group JIDs — we skip those for now. */
export function isGroupJid(jid: string): boolean {
  return jid.includes('@g.us')
}
