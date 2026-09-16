import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://roxnhmogzvpuyiebfpmt.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveG5obW9nenZwdXlpZWJmcG10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njg1MjQwNSwiZXhwIjoyMTAyNDI4NDA1fQ.6QvgAM8-Dy0Cd-4K7-eJ1Trn9TlDlwwSYS6b1FcgRK4'
const ACCOUNT_ID = '09e3c669-922d-42c0-8476-bee783f979ca'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Clear any stale session state
const { error: sessErr } = await supabase
  .from('whatsapp_session_state')
  .delete()
  .eq('whatsapp_account_id', ACCOUNT_ID)
if (sessErr) console.log('Session state clear (may not exist):', sessErr.message)
else console.log('Session state cleared')

// Reset the account row to clean DISCONNECTED state
const { error } = await supabase
  .from('whatsapp_accounts')
  .update({
    connection_state: 'DISCONNECTED',
    qr_data_uri: null,
    qr_generated_at: null,
    reconnect_attempts: 0,
    last_error: null,
    worker_instance_id: null,
    disconnect_requested_at: null,
  })
  .eq('id', ACCOUNT_ID)

if (error) { console.error('Reset failed:', error.message); process.exit(1) }
console.log('Account row reset to DISCONNECTED — ready for fresh QR')
console.log('\nNow run: npm run dev')
