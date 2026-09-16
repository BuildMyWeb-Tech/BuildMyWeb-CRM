import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://roxnhmogzvpuyiebfpmt.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveG5obW9nenZwdXlpZWJmcG10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njg1MjQwNSwiZXhwIjoyMTAyNDI4NDA1fQ.6QvgAM8-Dy0Cd-4K7-eJ1Trn9TlDlwwSYS6b1FcgRK4'
const ACCOUNT_ID = '09e3c669-922d-42c0-8476-bee783f979ca'

const s = createClient(SUPABASE_URL, SERVICE_KEY)

// 1. whatsapp_accounts row
const { data: acc } = await s.from('whatsapp_accounts')
  .select('id, connection_state, reconnect_attempts, last_error, worker_instance_id, disconnect_requested_at, qr_data_uri')
  .eq('id', ACCOUNT_ID).single()
console.log('\n=== whatsapp_accounts ===')
console.log('connection_state:', acc?.connection_state)
console.log('reconnect_attempts:', acc?.reconnect_attempts)
console.log('last_error:', acc?.last_error)
console.log('worker_instance_id:', acc?.worker_instance_id)
console.log('has qr_data_uri:', !!acc?.qr_data_uri)

// 2. session state
const { data: sess } = await s.from('whatsapp_session_state')
  .select('whatsapp_account_id, updated_at').eq('whatsapp_account_id', ACCOUNT_ID).maybeSingle()
console.log('\n=== whatsapp_session_state ===')
console.log(sess ? `Session exists, updated: ${sess.updated_at}` : 'No session (will generate QR on start)')

// 3. connection lock
const { data: lock } = await s.from('whatsapp_connection_locks')
  .select('*').eq('whatsapp_account_id', ACCOUNT_ID).maybeSingle()
console.log('\n=== connection lock ===')
console.log(lock ? JSON.stringify(lock, null, 2) : 'No lock row')

console.log('\n=== DIAGNOSIS ===')
if (!acc) { console.log('ERROR: No whatsapp_accounts row found! Run: click Connect WhatsApp in CRM'); process.exit(1) }
if (acc.connection_state === 'RECONNECTING') console.log('DB stuck in RECONNECTING — run reset-account.mjs then npm run dev')
if (acc.connection_state === 'ERROR') console.log('Worker crashed — check worker terminal for error message, then run reset-account.mjs')
if (acc.connection_state === 'DISCONNECTED') console.log('DB is clean DISCONNECTED — start worker: npm run dev')
if (acc.connection_state === 'QR_REQUIRED') console.log('QR is ready — open http://localhost:3000/whatsapp-connect and scan')
if (acc.connection_state === 'CONNECTED') console.log('Already connected!')
if (lock) {
  const age = (Date.now() - new Date(lock.locked_at ?? lock.created_at).getTime()) / 1000
  if (age > 120) console.log(`STALE LOCK (${Math.round(age)}s old) — worker probably crashed. Run reset-account.mjs to clear`)
  else console.log(`Lock is fresh (${Math.round(age)}s) — worker is running`)
}
