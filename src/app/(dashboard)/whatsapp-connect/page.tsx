'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  Wifi, WifiOff, RefreshCw, QrCode, CheckCircle2, XCircle, Loader2, LogOut, X,
} from 'lucide-react'
import type { WhatsAppAccount, WaConnectionState } from '@/types'
import { useAuth } from '@/hooks/use-auth'
import type { AccountMember } from '@/types'

type PageState = 'idle' | 'loading' | 'qr' | 'connecting' | 'connected' | 'reconnecting' | 'logged_out' | 'error'

function derivePageState(account: WhatsAppAccount | null, fetchErr: boolean): PageState {
  if (fetchErr) return 'error'
  if (!account) return 'idle'
  const cs = account.connection_state as WaConnectionState
  if (cs === 'CONNECTED') return 'connected'
  if (cs === 'QR_REQUIRED') return 'qr'
  if (cs === 'RECONNECTING') return 'reconnecting'
  if (cs === 'LOGGED_OUT') return 'logged_out'
  if (cs === 'ERROR') return 'error'
  return 'connecting'
}

const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳', name: 'IN' },
  { code: '+1',  flag: '🇺🇸', name: 'US' },
  { code: '+44', flag: '🇬🇧', name: 'GB' },
  { code: '+971', flag: '🇦🇪', name: 'AE' },
  { code: '+65',  flag: '🇸🇬', name: 'SG' },
  { code: '+60',  flag: '🇲🇾', name: 'MY' },
  { code: '+61',  flag: '🇦🇺', name: 'AU' },
]

function WaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.554 4.122 1.523 5.85L.057 23.386a.75.75 0 0 0 .925.924l5.493-1.475A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.703 9.703 0 0 1-4.947-1.352l-.355-.21-3.683.988.997-3.728-.229-.373A9.717 9.717 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
    </svg>
  )
}

// ── Pair dialog ────────────────────────────────────────────────────────────────

function PairDialog({
  onClose,
  onConnect,
  qrUri,
  pageState,
  members,
}: {
  onClose: () => void
  onConnect: (deviceName: string, phone: string) => void
  qrUri: string | null | undefined
  pageState: PageState
  members: AccountMember[]
}) {
  const { user } = useAuth()
  const [deviceName, setDeviceName] = useState('Sales line')
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNum, setPhoneNum] = useState('')
  const [assignTo, setAssignTo] = useState(user?.id ?? '')
  const [activateAfter, setActivateAfter] = useState(true)
  const [step, setStep] = useState<'details' | 'scanning'>(() =>
    pageState === 'qr' || pageState === 'connecting' || pageState === 'connected' ? 'scanning' : 'details'
  )

  function handleConnect() {
    const fullPhone = `${countryCode}${phoneNum.replace(/\D/g, '')}`
    onConnect(deviceName, fullPhone)
    setStep('scanning')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#f5f0e8] shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="px-8 pt-6 pb-4 border-b border-[#e8e0d0]">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#8a7a60] mb-1">new device</p>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[#2c2416]">Pair a WhatsApp number</h2>
            <button onClick={onClose} className="text-[#8a7a60] hover:text-[#2c2416] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-[#e8e0d0]">
          {/* Left: device details */}
          <div className="p-8 space-y-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a7a60]">1. DEVICE DETAILS</p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#2c2416]">
                Device name <span className="text-red-500">*</span>
              </label>
              <input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Sales line"
                className="w-full rounded-xl border border-[#d8cfc0] bg-white px-4 py-2.5 text-sm text-[#2c2416] placeholder:text-[#b0a080] focus:border-[#2c2416] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#2c2416]">
                Mobile number <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="appearance-none rounded-xl border border-[#d8cfc0] bg-white pl-3 pr-8 py-2.5 text-sm text-[#2c2416] focus:border-[#2c2416] focus:outline-none"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={phoneNum}
                  onChange={(e) => setPhoneNum(e.target.value)}
                  placeholder="81234 56789"
                  type="tel"
                  className="flex-1 rounded-xl border border-[#d8cfc0] bg-white px-4 py-2.5 text-sm text-[#2c2416] placeholder:text-[#b0a080] focus:border-[#2c2416] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#2c2416]">Assign to</label>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="w-full rounded-xl border border-[#d8cfc0] bg-white px-4 py-2.5 text-sm text-[#2c2416] focus:border-[#2c2416] focus:outline-none"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}{m.user_id === user?.id ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-[#d8cfc0] bg-white px-4 py-3 flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#2c2416]">Activate after pairing</p>
                <p className="text-xs text-[#8a7a60] mt-0.5">Routes new sends to this device immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => setActivateAfter((v) => !v)}
                className={`mt-0.5 h-5 w-5 flex items-center justify-center rounded border-2 transition-colors ${activateAfter ? 'bg-[#2c7a3a] border-[#2c7a3a]' : 'border-[#d8cfc0] bg-white'}`}
              >
                {activateAfter && <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
            </div>
          </div>

          {/* Right: QR pane */}
          <div className="p-8 flex flex-col items-center gap-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a7a60] self-start">2. SCAN QR</p>

            <div className="flex-1 flex flex-col items-center justify-center w-full">
              {step === 'details' ? (
                <div className="rounded-2xl border-2 border-dashed border-[#d8cfc0] bg-white/60 w-full aspect-square max-w-[200px] flex flex-col items-center justify-center gap-3 p-6">
                  {/* QR placeholder icon */}
                  <div className="grid grid-cols-2 gap-1 opacity-30">
                    <div className="h-8 w-8 rounded border-2 border-[#8a7a60]" />
                    <div className="h-8 w-8 rounded border-2 border-[#8a7a60]" />
                    <div className="h-8 w-8 rounded border-2 border-[#8a7a60]" />
                    <div className="h-8 w-8 rounded" />
                  </div>
                  <p className="text-sm font-semibold text-[#2c2416] text-center">Connect to see the QR</p>
                  <p className="text-[10px] font-mono text-[#8a7a60] text-center">QR appears once you click Connect</p>
                </div>
              ) : pageState === 'qr' && qrUri ? (
                <div className="rounded-2xl border-2 border-green-300 bg-white p-2">
                  <Image src={qrUri} alt="WhatsApp QR" width={180} height={180} unoptimized className="rounded-lg" />
                </div>
              ) : pageState === 'connected' ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-16 h-16 text-green-500" />
                  <p className="font-semibold text-[#2c2416]">Connected!</p>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-[#d8cfc0] bg-white/60 w-full aspect-square max-w-[200px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#8a7a60]" />
                </div>
              )}
            </div>

            <ol className="text-xs text-[#8a7a60] space-y-1 w-full">
              <li>1. Open <span className="font-medium text-[#2c2416]">WhatsApp</span> on your phone.</li>
              <li>2. Tap <span className="font-medium text-[#2c2416]">Settings → Linked devices</span>.</li>
              <li>3. Tap <span className="font-medium text-[#2c2416]">Link a device</span> and scan this QR.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e8e0d0] flex items-center justify-between">
          <a href="https://faq.whatsapp.com/1317564962315842" target="_blank" rel="noreferrer"
            className="text-xs text-[#8a7a60] hover:text-[#2c2416] underline underline-offset-2">
            Pairing troubleshooting →
          </a>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-5 py-2 rounded-lg border border-[#d8cfc0] text-sm text-[#2c2416] hover:bg-[#ede8dd] transition-colors">
              Cancel
            </button>
            {step === 'details' ? (
              <button
                onClick={handleConnect}
                disabled={!deviceName.trim() || !phoneNum.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#1a3a24] text-sm font-medium text-white hover:bg-[#2c5a38] disabled:opacity-40 transition-colors"
              >
                Connect &amp; show QR →
              </button>
            ) : pageState === 'connected' ? (
              <button onClick={onClose}
                className="px-5 py-2 rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700">
                Done
              </button>
            ) : (
              <div className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#1a3a24]/60 text-sm text-white">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for scan…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WhatsAppConnectPage() {
  const { accountId } = useAuth()
  const [account, setAccount] = useState<WhatsAppAccount | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [fetchErr, setFetchErr] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const [pairOpen, setPairOpen] = useState(false)
  const [members, setMembers] = useState<AccountMember[]>([])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/qr/status')
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const acc: WhatsAppAccount | null = json.account ?? null
      setAccount(acc)
      setFetchErr(false)
      setPageState(derivePageState(acc, false))
    } catch {
      setFetchErr(true)
      setPageState('error')
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Auto-open pair dialog when QR becomes available so it's always shown in context
  useEffect(() => {
    if (pageState === 'qr') setPairOpen(true)
  }, [pageState])

  useEffect(() => {
    if (pageState === 'connected') return
    const id = setInterval(fetchStatus, 3000)
    return () => clearInterval(id)
  }, [pageState, fetchStatus])

  useEffect(() => {
    if (!accountId) return
    fetch('/api/account/members').then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.members) setMembers(d.members)
    })
  }, [accountId])

  async function handleConnect(deviceName: string, phone: string) {
    setActionBusy(true)
    try {
      const res = await fetch('/api/whatsapp/qr/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: deviceName, phone_number: phone }),
      })
      if (!res.ok) throw new Error('connect failed')
      await fetchStatus()
    } catch {
      setFetchErr(true)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!disconnectConfirm) { setDisconnectConfirm(true); return }
    setActionBusy(true)
    setDisconnectConfirm(false)
    try {
      await fetch('/api/whatsapp/qr/disconnect', { method: 'POST' })
      await fetchStatus()
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <>
      {pairOpen && (
        <PairDialog
          onClose={() => setPairOpen(false)}
          onConnect={handleConnect}
          qrUri={account?.qr_data_uri}
          pageState={pageState}
          members={members}
        />
      )}

      <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center bg-gray-50 dark:bg-gray-950 pt-12 px-4">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <WaIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Connect WhatsApp</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Link your WhatsApp number to receive and send messages from the CRM
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-8">

            {pageState === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <p className="text-sm text-gray-500">Checking connection status…</p>
              </div>
            )}

            {(pageState === 'idle' || pageState === 'logged_out') && (
              <div className="flex flex-col items-center gap-6 py-4">
                {pageState === 'logged_out' ? (
                  <WifiOff className="w-14 h-14 text-gray-300 dark:text-gray-700" />
                ) : (
                  <QrCode className="w-14 h-14 text-gray-300 dark:text-gray-700" />
                )}
                <div className="text-center">
                  <p className="font-medium text-gray-800 dark:text-gray-200">
                    {pageState === 'logged_out' ? 'WhatsApp session ended' : 'No WhatsApp account connected'}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {pageState === 'logged_out'
                      ? 'Scan a new QR code to reconnect.'
                      : 'Pair your WhatsApp number to get started.'}
                  </p>
                </div>
                <button
                  onClick={() => setPairOpen(true)}
                  disabled={actionBusy}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  {pageState === 'logged_out' ? 'Reconnect WhatsApp' : 'Pair a WhatsApp number'}
                </button>
              </div>
            )}

            {pageState === 'connecting' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                <div className="text-center">
                  <p className="font-medium text-gray-800 dark:text-gray-200">Connecting…</p>
                  <p className="mt-1 text-sm text-gray-500">{account?.connection_state ?? 'Starting worker'}</p>
                </div>
              </div>
            )}

            {pageState === 'reconnecting' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <RefreshCw className="w-10 h-10 animate-spin text-amber-500" />
                <div className="text-center">
                  <p className="font-medium text-gray-800 dark:text-gray-200">Reconnecting…</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Attempt {account?.reconnect_attempts ?? 0}. Will restore automatically.
                  </p>
                </div>
              </div>
            )}

            {pageState === 'connected' && (
              <div className="flex flex-col items-center gap-6 py-4">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {account?.phone_number ? `Connected: ${account.phone_number}` : 'WhatsApp Connected'}
                  </p>
                  {account?.display_name && (
                    <p className="text-sm text-gray-500 mt-1">{account.display_name}</p>
                  )}
                  {account?.last_connected_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      Connected since {new Date(account.last_connected_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="w-full border-t border-gray-100 dark:border-gray-800 pt-4">
                  {disconnectConfirm ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-red-600 dark:text-red-400 text-center">
                        This will log out and require a new QR scan. Continue?
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setDisconnectConfirm(false)}
                          className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                          Cancel
                        </button>
                        <button onClick={handleDisconnect} disabled={actionBusy}
                          className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1">
                          {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setDisconnectConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <LogOut className="w-4 h-4" />
                      Disconnect WhatsApp
                    </button>
                  )}
                </div>
              </div>
            )}

            {pageState === 'error' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <XCircle className="w-10 h-10 text-red-500" />
                <div className="text-center">
                  <p className="font-medium text-gray-800 dark:text-gray-200">Connection Error</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {account?.last_error ?? 'Unable to reach the worker. Check deployment.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={fetchStatus}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                  <button onClick={() => setPairOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm text-white">
                    <QrCode className="w-4 h-4" />
                    Try pairing again
                  </button>
                </div>
              </div>
            )}
          </div>

          {account && pageState !== 'loading' && (
            <div className="mt-4 flex justify-center">
              <StatusBadge state={account.connection_state as WaConnectionState} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatusBadge({ state }: { state: WaConnectionState }) {
  const map: Record<WaConnectionState, { label: string; color: string }> = {
    CONNECTED:      { label: 'Connected',      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    QR_REQUIRED:    { label: 'QR Required',    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    RECONNECTING:   { label: 'Reconnecting',   color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    STARTING:       { label: 'Starting',       color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    AUTHENTICATING: { label: 'Authenticating', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    PAIRING:        { label: 'Pairing',        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    LOGGED_OUT:     { label: 'Logged Out',     color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    DISCONNECTED:   { label: 'Disconnected',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    ERROR:          { label: 'Error',          color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const item = map[state] ?? { label: state, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${item.color}`}>
      {item.label}
    </span>
  )
}
