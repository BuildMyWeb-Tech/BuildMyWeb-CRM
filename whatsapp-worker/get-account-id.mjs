import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const SUPABASE_URL = 'https://roxnhmogzvpuyiebfpmt.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveG5obW9nenZwdXlpZWJmcG10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njg1MjQwNSwiZXhwIjoyMTAyNDI4NDA1fQ.6QvgAM8-Dy0Cd-4K7-eJ1Trn9TlDlwwSYS6b1FcgRK4'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const { data, error } = await supabase
  .from('whatsapp_accounts')
  .select('id, connection_state, account_id')
  .eq('provider', 'qr')
  .order('created_at', { ascending: false })
  .limit(1)

if (error) { console.error('DB error:', error.message); process.exit(1) }
if (!data || data.length === 0) { console.error('No whatsapp_accounts row found. Click "Connect WhatsApp" in the CRM first.'); process.exit(1) }

const id = data[0].id
console.log('Found account ID:', id)
console.log('Connection state:', data[0].connection_state)

// Patch the .env file
const envPath = new URL('.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
let env = readFileSync(envPath, 'utf8')
env = env.replace(/WHATSAPP_ACCOUNT_ID=.*/, `WHATSAPP_ACCOUNT_ID=${id}`)
writeFileSync(envPath, env)
console.log('\n.env updated with WHATSAPP_ACCOUNT_ID =', id)
console.log('\nNow run: npm run dev')
