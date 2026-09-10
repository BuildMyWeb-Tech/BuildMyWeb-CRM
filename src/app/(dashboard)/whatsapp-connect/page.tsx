'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  QrCode,
  CheckCircle2,
  XCircle,
  Loader2,
  LogOut,
} from 'lucide-react'
import type { WhatsAppAccount, WaConnectionState } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

type PageState =
  | 'idle'           // no account row yet
  | 'loading'        // initial fetch
  | 'qr'             // QR_REQUIRED — show QR
  | 'connecting'     // STARTING | AUTHENTICATING | PAIRING
  | 'connected'      // CONNECTED
  | 'reconnecting'   // RECONNECTING
  | 'logged_out'     // LOGGED_OUT
  | 'error'          // ERROR or fetch failure

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

// ── Component ──────────────────────────────────────────────────────────────

export default function WhatsAppConnectPage() {
  const [account, setAccount] = useState<WhatsAppAccount | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [fetchErr, setFetchErr] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)

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

  // Initial load
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll every 3 s when not yet connected
  useEffect(() => {
    if (pageState === 'connected') return
    const id = setInterval(fetchStatus, 3000)
    return () => clearInterval(id)
  }, [pageState, fetchStatus])

  async function handleConnect() {
    setActionBusy(true)
    try {
      const res = await fetch('/api/whatsapp/qr/connect', { method: 'POST' })
      if (!res.ok) throw new Error('connect failed')
      await fetchStatus()
    } catch {
      setFetchErr(true)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!disconnectConfirm) {
      setDisconnectConfirm(true)
      return
    }
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
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center bg-gray-50 dark:bg-gray-950 pt-12 px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-green-600 dark:fill-green-400">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.554 4.122 1.523 5.85L.057 23.386a.75.75 0 0 0 .925.924l5.493-1.475A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.703 9.703 0 0 1-4.947-1.352l-.355-.21-3.683.988.997-3.728-.229-.373A9.717 9.717 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Connect WhatsApp</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Link your WhatsApp number to receive and send messages from the CRM
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-8">

          {/* LOADING */}
          {pageState === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              <p className="text-sm text-gray-500">Checking connection status…</p>
            </div>
          )}

          {/* IDLE — no account created yet */}
          {pageState === 'idle' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <QrCode className="w-16 h-16 text-gray-300 dark:text-gray-700" />
              <div className="text-center">
                <p className="font-medium text-gray-800 dark:text-gray-200">No WhatsApp account connected</p>
                <p className="mt-1 text-sm text-gray-500">Start the connection to generate a QR code</p>
              </div>
              <button
                onClick={handleConnect}
                disabled={actionBusy}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                Connect WhatsApp
              </button>
            </div>
          )}

          {/* QR REQUIRED */}
          {pageState === 'qr' && (
            <div className="flex flex-col items-center gap-6">
              <div className="p-3 rounded-xl border-2 border-green-200 dark:border-green-800 bg-white">
                {account?.qr_data_uri ? (
                  <Image
                    src={account.qr_data_uri}
                    alt="WhatsApp QR code"
                    width={220}
                    height={220}
                    className="rounded"
                    unoptimized
                  />
                ) : (
                  <div className="w-[220px] h-[220px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 text-left w-full">
                <li>1. Open <span className="font-medium text-gray-800 dark:text-gray-200">WhatsApp</span> on your phone</li>
                <li>2. Tap <span className="font-medium">⋮ Menu → Linked Devices</span></li>
                <li>3. Tap <span className="font-medium">Link a Device</span> and scan this code</li>
              </ol>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Waiting for scan…
              </p>
            </div>
          )}

          {/* CONNECTING / AUTHENTICATING / PAIRING */}
          {pageState === 'connecting' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-green-600" />
              <div className="text-center">
                <p className="font-medium text-gray-800 dark:text-gray-200">Connecting…</p>
                <p className="mt-1 text-sm text-gray-500">
                  {account?.connection_state ?? 'Starting worker'}
                </p>
              </div>
            </div>
          )}

          {/* CONNECTED */}
          {pageState === 'connected' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {account?.phone_number
                    ? `Connected: ${account.phone_number}`
                    : 'WhatsApp Connected'}
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
                      This will log out the device and require a new QR scan. Continue?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDisconnectConfirm(false)}
                        className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDisconnect}
                        disabled={actionBusy}
                        className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDisconnectConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}

          {/* RECONNECTING */}
          {pageState === 'reconnecting' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <RefreshCw className="w-10 h-10 animate-spin text-amber-500" />
              <div className="text-center">
                <p className="font-medium text-gray-800 dark:text-gray-200">Reconnecting…</p>
                <p className="mt-1 text-sm text-gray-500">
                  Attempt {account?.reconnect_attempts ?? 0}. No action needed — will restore automatically.
                </p>
              </div>
            </div>
          )}

          {/* LOGGED OUT */}
          {pageState === 'logged_out' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <WifiOff className="w-10 h-10 text-gray-400" />
              <div className="text-center">
                <p className="font-medium text-gray-800 dark:text-gray-200">Disconnected</p>
                <p className="mt-1 text-sm text-gray-500">
                  WhatsApp session ended. Scan a new QR to reconnect.
                </p>
              </div>
              <button
                onClick={handleConnect}
                disabled={actionBusy}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Generate New QR
              </button>
            </div>
          )}

          {/* ERROR */}
          {pageState === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <XCircle className="w-10 h-10 text-red-500" />
              <div className="text-center">
                <p className="font-medium text-gray-800 dark:text-gray-200">Connection Error</p>
                <p className="mt-1 text-sm text-gray-500">
                  {account?.last_error ?? 'Unable to reach the worker. Check deployment.'}
                </p>
              </div>
              <button
                onClick={fetchStatus}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          )}

        </div>

        {/* Status badge */}
        {account && pageState !== 'loading' && (
          <div className="mt-4 flex justify-center">
            <StatusBadge state={account.connection_state as WaConnectionState} />
          </div>
        )}
      </div>
    </div>
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
    DISCONNECTED:   { label: 'Disconnected',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    LOGGED_OUT:     { label: 'Logged Out',     color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    ERROR:          { label: 'Error',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  }
  const { label, color } = map[state] ?? map.DISCONNECTED
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
