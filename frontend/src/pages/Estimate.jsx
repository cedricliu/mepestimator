import { useState } from 'react'
import { API_BASE } from '../App'

const PROJECT_TYPES = [
  { code: 'WAREHOUSE',   label: 'WAREHOUSE — 倉儲' },
  { code: 'OFFICE',      label: 'OFFICE — 辦公' },
  { code: 'FACTORY',     label: 'FACTORY — 工廠' },
  { code: 'HOSPITAL',    label: 'HOSPITAL — 醫療' },
  { code: 'RESIDENTIAL', label: 'RESIDENTIAL — 住宅' },
  { code: 'DATACENTER',  label: 'DATACENTER — 資料中心' },
]

const DISCIPLINE_META = {
  ELEC:  { label: '電氣 ELEC',     color: 'bg-blue-700' },
  HVAC:  { label: '空調 HVAC',     color: 'bg-orange-600' },
  PLUMB: { label: '給排水 PLUMB',  color: 'bg-cyan-600' },
  FIRE:  { label: '消防 FIRE',     color: 'bg-red-600' },
  WEAK:  { label: '弱電 WEAK',     color: 'bg-purple-600' },
}

function fmt(val) {
  if (val == null) return '—'
  return Math.round(val).toLocaleString('zh-TW')
}

function exportCSV(rows) {
  const header = ['類別', '品名', '單位', '估計數量', '均價', '估算金額(均)', '最低金額', '最高金額']
  const lines = [header.join(',')]
  rows.forEach(r => {
    lines.push([
      r.discipline,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.uom,
      r.estimated_qty,
      r.avg_unit_price,
      r.estimated_avg,
      r.estimated_min,
      r.estimated_max,
    ].join(','))
  })
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mep_estimate.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function Estimate() {
  const [projectType, setProjectType] = useState('')
  const [gfa, setGfa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  async function generate() {
    if (!projectType || !gfa || Number(gfa) <= 0) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const params = new URLSearchParams({ project_type: projectType, gfa_m2: gfa })
      const res = await fetch(`${API_BASE}/quotes/estimate?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      if (json.meta?.errors?.length) throw new Error(json.meta.errors[0])
      setData(json.data || [])
    } catch (e) {
      setError(`API 錯誤: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Group by discipline
  const grouped = data
    ? Object.entries(
        data.reduce((acc, r) => {
          ;(acc[r.discipline] = acc[r.discipline] || []).push(r)
          return acc
        }, {})
      )
    : []

  const grandMin = data ? data.reduce((s, r) => s + (r.estimated_min || 0), 0) : 0
  const grandMax = data ? data.reduce((s, r) => s + (r.estimated_max || 0), 0) : 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">快速估價 / Quick Estimate</h1>

      {/* Form */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            專案類型 Project Type
          </label>
          <select
            value={projectType}
            onChange={e => setProjectType(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-52"
          >
            <option value="">— 請選擇 —</option>
            {PROJECT_TYPES.map(pt => (
              <option key={pt.code} value={pt.code}>{pt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            樓地板面積 GFA (m²)
          </label>
          <input
            type="number"
            min="1"
            value={gfa}
            onChange={e => setGfa(e.target.value)}
            placeholder="例: 5000"
            className="border border-gray-300 rounded px-3 py-2 text-sm w-36
                       focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={generate}
          disabled={!projectType || !gfa || loading}
          className={`px-6 py-2 rounded font-semibold text-white transition-colors ${
            !projectType || !gfa || loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-700 hover:bg-blue-800'
          }`}
        >
          {loading ? '計算中...' : '產生估價'}
        </button>

        {data && data.length > 0 && (
          <button
            onClick={() => exportCSV(data)}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
          >
            匯出 CSV
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-gray-500 animate-pulse text-lg">計算中...</div>
      )}

      {/* Empty state after load */}
      {data && data.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          尚無報價資料可供估算，請先上傳標單
        </div>
      )}

      {/* Results grouped by discipline */}
      {grouped.map(([disc, rows]) => {
        const meta = DISCIPLINE_META[disc] || { label: disc, color: 'bg-gray-600' }
        const subMin = rows.reduce((s, r) => s + (r.estimated_min || 0), 0)
        const subMax = rows.reduce((s, r) => s + (r.estimated_max || 0), 0)
        return (
          <div key={disc} className="mb-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className={`${meta.color} text-white px-4 py-2 font-semibold text-sm flex justify-between`}>
              <span>{meta.label}</span>
              <span>小計: NT$ {fmt(subMin)} ~ {fmt(subMax)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">品名<br /><span className="font-normal text-gray-400">Description</span></th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">單位<br /><span className="font-normal text-gray-400">UoM</span></th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">估計數量<br /><span className="font-normal text-gray-400">Est. Qty</span></th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">單價區間 (NT$)<br /><span className="font-normal text-gray-400">Unit Price Range</span></th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">金額區間 (NT$)<br /><span className="font-normal text-gray-400">Amount Range</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 max-w-xs truncate" title={r.description}>{r.description}</td>
                      <td className="px-3 py-2 text-center">{r.uom}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.estimated_qty?.toLocaleString('zh-TW')}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {fmt(r.min_unit_price)} ~ {fmt(r.max_unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmt(r.estimated_min)} ~ {fmt(r.estimated_max)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Grand total */}
      {data && data.length > 0 && (
        <div className="mt-4 bg-gray-800 text-white rounded-lg px-6 py-4 flex justify-between items-center">
          <span className="font-bold text-lg">總估算金額 Grand Total</span>
          <span className="text-xl font-bold">
            NT$ {fmt(grandMin)} ~ {fmt(grandMax)}
          </span>
        </div>
      )}
    </div>
  )
}
