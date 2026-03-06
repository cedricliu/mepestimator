import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../App'

const PAGE_SIZE = 50

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('zh-TW')
}

// ---------------------------------------------------------------------------
// ProductTable — paginated product catalogue
// ---------------------------------------------------------------------------
function ProductTable() {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]     = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/products/all`)
      .then(r => r.json())
      .then(j => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)

  if (loading) return <div className="py-8 text-center text-gray-400 animate-pulse">載入中...</div>

  if (rows.length === 0)
    return (
      <div className="py-8 text-center text-gray-400">
        尚無品項資料。請先上傳標單並等待產品對應。
      </div>
    )

  return (
    <div>
      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">品名</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">族系</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">規格屬性</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">廠牌</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">報價數</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const specSummary = Object.values(row.attributes || {}).join(' / ') || '—'
              return (
                <tr key={row.product_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 max-w-xs truncate" title={row.description}>{row.description}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{row.family_name_zh}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate" title={specSummary}>{specSummary}</td>
                  <td className="px-3 py-2">{row.brand_name || '—'}</td>
                  <td className="px-3 py-2 text-right">{row.quote_count ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-2 flex gap-2 items-center justify-end text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
          >
            ‹
          </button>
          <span className="text-gray-500">{page + 1} / {totalPages}</span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
          >
            ›
          </button>
        </div>
      )}
      <div className="mt-1 text-xs text-gray-400">共 {rows.length} 筆</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssignControl — debounced product search + assign button per unmatched row
// ---------------------------------------------------------------------------
function AssignControl({ lineId, onAssigned }) {
  const [q, setQ]               = useState('')
  const [options, setOptions]   = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy]         = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setOptions([]); return }
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/products/all?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => setOptions((j.data || []).slice(0, 8)))
        .catch(() => setOptions([]))
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [q])

  const assign = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/products/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: lineId, product_id: selected.product_id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onAssigned(lineId)
    } catch (e) {
      alert(`指定失敗: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setSelected(null) }}
        placeholder="搜尋品項..."
        className="border border-gray-300 rounded px-2 py-1 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {options.length > 0 && !selected && (
        <div className="border border-gray-200 rounded shadow-sm bg-white z-10 max-h-40 overflow-auto">
          {options.map(o => (
            <div
              key={o.product_id}
              onClick={() => { setSelected(o); setQ(o.description); setOptions([]) }}
              className="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer"
            >
              {o.description}
            </div>
          ))}
        </div>
      )}
      {selected && (
        <button
          onClick={assign}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '...' : '指定'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UnmatchedTable — quote lines without product_id
// ---------------------------------------------------------------------------
function UnmatchedTable() {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/products/unmatched`)
      .then(r => r.json())
      .then(j => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const handleAssigned = (lineId) =>
    setRows(prev => prev.filter(r => String(r.line_id) !== lineId))

  if (loading) return <div className="py-4 text-center text-gray-400 animate-pulse">載入中...</div>

  if (rows.length === 0)
    return <div className="py-4 text-center text-gray-400">全部品項已完成對應</div>

  return (
    <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-700">類別</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700">品名規格</th>
            <th className="px-3 py-2 text-center font-semibold text-gray-700">單位</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700">單價</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700">指定品項</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.line_id)} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-2">
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{row.discipline}</span>
              </td>
              <td className="px-3 py-2 max-w-xs truncate" title={row.description}>{row.description}</td>
              <td className="px-3 py-2 text-center">{row.uom}</td>
              <td className="px-3 py-2 text-right">{fmt(row.unit_price)}</td>
              <td className="px-3 py-2">
                <AssignControl lineId={String(row.line_id)} onAssigned={handleAssigned} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1 text-xs text-gray-400">共 {rows.length} 筆未對應</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Products page
// ---------------------------------------------------------------------------
export default function Products() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">品項管理 / Products</h1>
        <p className="text-sm text-gray-500">結構化品項目錄及屬性管理</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">品項目錄</h2>
        <ProductTable />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-1">未對應品項 Unmatched Items</h2>
        <p className="text-xs text-gray-500 mb-3">以下報價行尚未對應至結構化品項，請手動指定</p>
        <UnmatchedTable />
      </section>
    </div>
  )
}
