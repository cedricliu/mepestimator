/**
 * Products — estimator read-only view.
 * Shows the full product catalogue with JSONB attributes.
 * No create/edit/delete — those live in the admin/ app.
 */
import { useState, useEffect, useContext } from 'react'
import { ApiContext } from '../App'

const PAGE_SIZE = 50

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('zh-TW')
}

// ---------------------------------------------------------------------------
// ProductTable — paginated product catalogue (read-only)
// ---------------------------------------------------------------------------
function ProductTable() {
  const api = useContext(ApiContext)
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(0)

  useEffect(() => {
    if (!api) return
    setLoading(true)
    api.get('/products/all')
      .then(r => setRows(r.data.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [api])

  const pageRows   = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
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
    </div>
  )
}
