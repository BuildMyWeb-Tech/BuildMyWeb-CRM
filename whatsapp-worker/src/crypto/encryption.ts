/**
 * AES-256-GCM encryption for session state — identical algorithm to
 * src/lib/whatsapp/encryption.ts in the CRM. Kept as a separate copy
 * so the worker has zero dependency on the Next.js app.
 *
 * Format: <iv-hex>:<ciphertext-hex>:<authTag-hex>
 * Key:    WHATSAPP_SESSION_ENCRYPTION_KEY (separate from CRM ENCRYPTION_KEY)
 */
import crypto from 'crypto'

const GCM_IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encrypt(plaintext: string, keyHex: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  let ct = cipher.update(plaintext, 'utf8', 'hex')
  ct += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${ct}:${tag.toString('hex')}`
}

export function decrypt(encryptedText: string, keyHex: string): string {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted session format')
  const [ivHex, ctHex, tagHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  if (iv.length !== GCM_IV_LENGTH) throw new Error('Bad IV length')
  const tag = Buffer.from(tagHex, 'hex')
  if (tag.length !== AUTH_TAG_LENGTH) throw new Error('Bad auth tag length')
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  decipher.setAuthTag(tag)
  let plain = decipher.update(ctHex, 'hex', 'utf8')
  plain += decipher.final('utf8')
  return plain
}
