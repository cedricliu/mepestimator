import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../App'

const DISCIPLINES = [
  { code: '', label: '全部 ALL' },
  { code: 'ELEC', label: '電氣 ELEC' },
  { code: 'HVAC', label: '空調 HVAC' },
  { code: 'PLUMB', label: '給排水 PLUMB' },
  { code: 'FIRE', label: '消防 FIRE' },
  { code: 'WEAK', label: '弱電 WEAK' },
]

const COLS = [
  { key: 'description',      label: '品名規格',  sub: 'Description',  align: 'left' },
  { key: 'uom',              label: '單位',      sub: 'UoM',           align: 'center' },
  { key: 'discipline',       label: '類別',      sub: 'Discipline',    align: 'center' },
  { key: 'avg_unit_price',   label: '均價',      sub: 'Avg (NT$)',     align: 'right' },
  { key: 'min_unit_price',   label: '最低',      sub: 'Min',           align: 'right' },
  { key: 'max_unit_price',   label: '最高',      sub: 'Max',           align: 'right' },
  { key: 'quote_count',      label: '報價數',    sub: 'Quotes',        align: 'center' },
  { key: 'latest_quote_date',label: '最新日期',  sub: 'Latest',        align: 'center' },
  { key: 'price_spread_pct', label: '價差',      sub: 'Spread %',      align: 'center' },
]

function SpreadBadge({ pct }) {
  if (pct == null) return null
  const cls =
    pct < 20
      ? 'bg-green-100 text-green-800'
      : pct <= 50
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  )
}

function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('zh-TW')
}

export default function Dashboard() {
  const [query, setQuery] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const debounceRef = useRef(null)

  const fetchData = useCallback(async (q, disc) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q, min_confidence: '0.7' })
      if (disc) params.set('discipline', disc)
      const res = await fetch(`${API_BASE}/quotes/search?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setResults(json.data || [])
    } catch (e) {
      setError(`API 錯誤: ${e.message}`)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchData(query, discipline), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, discipline, fetchData])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = [...results].sort((a, b) => {
    if (!sortCol) return 0
    const av = a[sortCol], bv = b[sortCol]
    if (av == null) return 1
    if (bv == null) return -1
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">報價查詢 / Price Search</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜尋品名規格..."
          className="flex-1 min-w-56 border border-gray-300 rounded px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex flex-wrap gap-1">
          {DISCIPLINES.map(d => (
            <button
              key={d.code}
              onClick={() => setDiscipline(d.code)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                discipline === d.code
                  ? 'bg-blue-700 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 animate-pulse text-lg">載入中...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-lg">
          尚無資料，請先上傳標單
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  {COLS.map(c => (
                    <th
                      key={c.key}
                      onClick={() => handleSort(c.key)}
                      className={`px-3 py-2 font-semibold text-gray-700 cursor-pointer select-none
                                  hover:bg-gray-200 whitespace-nowrap text-${c.align}`}
                    >
                      <div className="flex flex-col">
                        <span>
                          {c.label}
                          {sortCol === c.key && (
                            <span className="ml-1 text-blue-600">
                              {sortDir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400 font-normal">{c.sub}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 max-w-xs truncate" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-3 py-2 text-center">{row.uom}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {row.discipline}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(row.avg_unit_price)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(row.min_unit_price)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{fmt(row.max_unit_price)}</td>
                    <td className="px-3 py-2 text-center">{row.quote_count}</td>
                    <td className="px-3 py-2 text-center text-gray-500 text-xs">
                      {row.latest_quote_date || '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SpreadBadge pct={row.price_spread_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-gray-400">共 {results.length} 筆</div>
        </>
      )}
    </div>
  )
}
