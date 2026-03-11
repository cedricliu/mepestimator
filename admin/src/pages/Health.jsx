/**
 * Health.jsx — System status dashboard (Sprint 6).
 *
 * - Calls GET /health on mount and every 30 seconds
 * - Shows: DB connection status, proc.quote_lines count, proc.vendors count
 * - Color-coded status badges: green = ok, red = error
 * - parse_status breakdown noted as TODO (not returned by current /health)
 * - Also fetches proc.users count (admin email) as a secondary stat
 */

import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import { ApiContext } from '../App'

const REFRESH_INTERVAL = 30_000  // 30 seconds

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  const isOk = status === 'ok' || status === 'connected'
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
      isOk
        ? 'bg-green-100 text-green-800'
        : 'bg-red-100 text-red-700'
    }`}>
      <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
      {isOk ? '正常' : '異常'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
function StatCard({ label, value, sub, color }) {
  const colorMap = {
    blue:   'border-blue-200 bg-blue-50',
    green:  'border-green-200 bg-green-50',
    purple: 'border-purple-200 bg-purple-50',
    gray:   'border-gray-200 bg-gray-50',
  }
  return (
    <div className={`border rounded-xl p-5 ${colorMap[color] || colorMap.gray}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">
        {value ?? <span className="text-gray-300">—</span>}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-32 bg-gray-200 rounded-xl" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health page
// ---------------------------------------------------------------------------
export default function Health() {
  const api = useContext(ApiContext)

  const [health, setHealth]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [lastRefresh, setLast]  = useState(null)
  const [error, setError]       = useState(null)
  const timerRef = useRef(null)

  const fetchHealth = useCallback(async () => {
    if (!api) return
    try {
      const { data } = await api.get('/health')
      setHealth(data.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'GET /health 失敗')
      setHealth(null)
    } finally {
      setLoading(false)
      setLast(new Date())
    }
  }, [api])

  useEffect(() => {
    fetchHealth()
    timerRef.current = setInterval(fetchHealth, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchHealth])

  // Time since last refresh
  function timeSince(date) {
    if (!date) return ''
    const secs = Math.round((Date.now() - date.getTime()) / 1000)
    if (secs < 5) return '剛剛'
    if (secs < 60) return `${secs} 秒前`
    return `${Math.floor(secs / 60)} 分鐘前`
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">系統狀態</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            每 30 秒自動更新
            {lastRefresh && (
              <span className="ml-2 text-gray-400">— 上次更新: {timeSince(lastRefresh)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHealth() }}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          立即重新整理
        </button>
      </div>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="bg-red-50 border border-red-300 text-red-700 px-5 py-4 rounded-xl">
          <p className="font-semibold">無法取得系統狀態</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status row */}
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm font-medium text-gray-700">系統狀態</p>
              <p className="text-xs text-gray-400 mt-0.5">API 服務 + 資料庫連線</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">API</p>
                <StatusBadge status="ok" />
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">資料庫</p>
                <StatusBadge status={health?.db || 'error'} />
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="報價明細 (proc.quote_lines)"
              value={health?.quote_lines?.toLocaleString()}
              sub="已成功匯入的行數"
              color="blue"
            />
            <StatCard
              label="廠商數 (proc.vendors)"
              value={health?.vendors?.toLocaleString()}
              sub="已登錄廠商"
              color="green"
            />
            <StatCard
              label="使用者"
              value={health?.users != null ? health.users : '—'}
              sub={health?.admin_email ? `管理員: ${health.admin_email}` : 'TODO: /health 未回傳使用者資訊'}
              color="purple"
            />
          </div>

          {/* Parse status breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3">資料解析狀態分佈</h2>
            {health?.parse_status_breakdown ? (
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(health.parse_status_breakdown).map(([status, count]) => (
                  <div key={status} className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xl font-bold text-gray-800">{count}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{status}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
                TODO: parse_status 分佈未包含在 GET /health 回應中 — 可在 Sprint 7 擴充 health.py 加入此資訊。
              </div>
            )}
          </div>

          {/* Raw JSON (debug) */}
          <details className="bg-gray-50 border border-gray-200 rounded-xl">
            <summary className="px-5 py-3 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100 rounded-xl">
              原始回應 (debug)
            </summary>
            <pre className="px-5 pb-4 text-xs font-mono text-gray-500 overflow-x-auto">
              {JSON.stringify(health, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
