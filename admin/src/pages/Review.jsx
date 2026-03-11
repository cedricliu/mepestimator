/**
 * Review.jsx — NEEDS_REVIEW resolution queue (Sprint 6).
 *
 * - GET /ingest/review (paginated, limit=20) to fetch pending rows
 * - Each row renders as an expandable card showing raw data + editable attributes_raw fields
 * - "Confirm" → POST /ingest/resolve { raw_id, product_id, attributes }
 * - "Skip" → leaves row in NEEDS_REVIEW state
 * - On successful resolve: card is removed from list + success toast
 */

import { useState, useEffect, useCallback, useContext } from 'react'
import { ApiContext } from '../App'

const PAGE_LIMIT = 20

// ---------------------------------------------------------------------------
// Toast (simple in-component notification)
// ---------------------------------------------------------------------------
function Toast({ message, type, onClose }) {
  if (!message) return null
  const colors = type === 'error'
    ? 'bg-red-100 border-red-300 text-red-800'
    : 'bg-green-100 border-green-300 text-green-800'
  return (
    <div className={`fixed top-4 right-4 z-50 border rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 ${colors}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AttributeEditor — editable key/value inputs for attributes_raw JSONB
// ---------------------------------------------------------------------------
function AttributeEditor({ attrs, onChange }) {
  const entries = Object.entries(attrs || {})

  function updateValue(key, value) {
    onChange({ ...attrs, [key]: value })
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-1">
        未偵測到屬性 — 系統信心值低於閾值
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded w-36 flex-shrink-0">
            {key}
          </span>
          <input
            type="text"
            value={val}
            onChange={e => updateValue(key, e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewCard — single expandable NEEDS_REVIEW row
// ---------------------------------------------------------------------------
function ReviewCard({ row, api, onResolved }) {
  const [expanded, setExpanded] = useState(false)
  const [attrs, setAttrs] = useState(row.attributes_raw || {})
  const [productId, setProductId] = useState('')
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    if (!productId.trim()) {
      setError('請輸入 product_id（可從品項目錄複製）')
      return
    }
    setResolving(true)
    setError(null)
    try {
      await api.post('/ingest/resolve', {
        raw_id: row.raw_id,
        product_id: productId.trim(),
        attributes: attrs,
      })
      onResolved(row.raw_id, '已確認並匯入 proc.quote_lines')
    } catch (err) {
      setError(err.response?.data?.detail || '解析失敗，請再試一次')
    } finally {
      setResolving(false)
    }
  }

  function handleSkip() {
    setExpanded(false)
  }

  const disciplineColors = {
    ELEC:  'bg-yellow-100 text-yellow-800',
    HVAC:  'bg-blue-100  text-blue-800',
    PLUMB: 'bg-green-100 text-green-800',
    FIRE:  'bg-red-100   text-red-800',
    WEAK:  'bg-gray-100  text-gray-600',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 mt-0.5 ${
          disciplineColors[row.discipline] ?? 'bg-gray-100 text-gray-600'
        }`}>
          {row.discipline}
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">{row.description}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {row.vendor_code && (
              <span className="text-xs text-gray-500">廠商: {row.vendor_code}</span>
            )}
            {row.unit_price && (
              <span className="text-xs text-gray-500">單價: NT${Number(row.unit_price).toLocaleString()}</span>
            )}
            {row.uom && (
              <span className="text-xs text-gray-500">單位: {row.uom}</span>
            )}
            {row.parse_notes && (
              <span className="text-xs text-orange-600">{row.parse_notes}</span>
            )}
          </div>
        </div>

        <span className="text-gray-400 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail + action panel */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Raw data summary */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
            <div><span className="text-gray-400">原始說明: </span>{row.description}</div>
            <div><span className="text-gray-400">批次: </span>{row.import_batch}</div>
            <div><span className="text-gray-400">來源: </span>{row.source_file}</div>
            {row.item_code && <div><span className="text-gray-400">料號: </span>{row.item_code}</div>}
          </div>

          {/* Editable attributes */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              屬性 (可編輯後確認)
            </p>
            <AttributeEditor attrs={attrs} onChange={setAttrs} />
          </div>

          {/* Product ID input */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              對應 Product ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={productId}
              onChange={e => setProductId(e.target.value)}
              placeholder="貼上 product_id UUID（可從品項目錄取得）"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={resolving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {resolving ? '確認中…' : '確認匯入'}
            </button>
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              暫時跳過
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review page
// ---------------------------------------------------------------------------
export default function Review() {
  const api = useContext(ApiContext)

  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [offset, setOffset]     = useState(0)
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState(null)  // { message, type }

  const loadRows = useCallback(async (off = 0) => {
    if (!api) return
    setLoading(true)
    try {
      const { data } = await api.get(`/ingest/review?limit=${PAGE_LIMIT}&offset=${off}`)
      setRows(data.data)
      setTotal(data.meta.total)
      setOffset(off)
    } catch (err) {
      setToast({ message: '載入失敗: ' + (err.response?.data?.detail || err.message), type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { loadRows(0) }, [loadRows])

  function handleResolved(rawId, message) {
    setRows(prev => prev.filter(r => r.raw_id !== rawId))
    setTotal(prev => Math.max(0, prev - 1))
    setToast({ message, type: 'success' })
  }

  const totalPages = Math.ceil(total / PAGE_LIMIT)
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1

  return (
    <div>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">待審查資料</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            信心值低於 0.8 — 需人工確認品項對應
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${
            total > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'
          }`}>
            {total} 筆待審查
          </span>
          <button
            onClick={() => loadRows(offset)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            重新整理
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-3">✓</div>
          <p className="text-lg font-medium">無待審查資料</p>
          <p className="text-sm mt-1">所有資料已自動匯入或已完成人工確認</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map(row => (
              <ReviewCard
                key={row.raw_id}
                row={row}
                api={api}
                onResolved={handleResolved}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm">
              <span className="text-gray-500">
                第 {currentPage} / {totalPages} 頁，共 {total} 筆
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => loadRows(offset - PAGE_LIMIT)}
                  disabled={offset === 0}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  上一頁
                </button>
                <button
                  onClick={() => loadRows(offset + PAGE_LIMIT)}
                  disabled={offset + PAGE_LIMIT >= total}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  下一頁
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
