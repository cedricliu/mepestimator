import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API_BASE } from '../App'

// URL params that are not attribute filter keys
const RESERVED = new Set(['family', 'sort', 'page', 'date_from', 'date_to', 'brand_ids', 'vendor_ids'])

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('zh-TW')
}

function spreadPct(min, max, avg) {
  if (min == null || max == null || avg == null || Number(avg) === 0) return null
  return Math.round(((Number(max) - Number(min)) / Number(avg)) * 100)
}

// ─── sub-components ──────────────────────────────────────────────────────────
function SpreadBar({ min, max, avg }) {
  const pct = spreadPct(min, max, avg)
  if (pct == null) return null
  const color = pct < 20 ? 'bg-green-400' : pct <= 50 ? 'bg-yellow-400' : 'bg-red-400'
  const badge = pct < 20
    ? 'text-green-700 bg-green-50 border-green-200'
    : pct <= 50
    ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : 'text-red-700 bg-red-50 border-red-200'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${Math.min(pct * 2, 100)}%` }} />
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badge}`}>
        {pct}%
      </span>
    </div>
  )
}

// Vendor price comparison — simple SVG bar chart
function VendorChart({ vendors }) {
  if (!vendors || vendors.length === 0) return null
  const data = vendors.map(v => ({ name: v.vendor_name, price: Number(v.avg_price) || 0 }))
  const maxP = Math.max(...data.map(d => d.price), 1)
  const W = 240, H = 72, barW = Math.max(18, Math.min(36, (W - 20) / data.length - 6))
  const gap = (W - data.length * barW) / (data.length + 1)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`}>
      {data.map((d, i) => {
        const barH = maxP === 0 ? 10 : Math.max(6, (d.price / maxP) * (H - 12))
        const x = gap + i * (barW + gap)
        const y = H - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="2" fill="#3b82f6" fillOpacity="0.75" />
            <text
              x={x + barW / 2} y={H + 12}
              textAnchor="middle"
              style={{ fontSize: 8, fontFamily: 'sans-serif', fill: '#6b7280' }}
            >
              {d.name.slice(0, 4)}
            </text>
            <text
              x={x + barW / 2} y={y - 3}
              textAnchor="middle"
              style={{ fontSize: 8, fontFamily: 'sans-serif', fill: '#1d4ed8' }}
            >
              {Math.round(d.price)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <div className="h-2.5 bg-gray-100 rounded mb-1" />
            <div className="h-5 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="h-1.5 bg-gray-200 rounded w-full mb-3" />
      <div className="flex justify-between">
        <div className="h-3 bg-gray-100 rounded w-1/3" />
        <div className="h-6 bg-gray-200 rounded w-20" />
      </div>
    </div>
  )
}

function ProductCard({ product, facets, expanded, onToggleExpand }) {
  const attrs    = product.attributes || {}
  const attrDefs = facets?.facets || []
  const specParts = attrDefs.map(f => {
    const v = attrs[f.attr_key]
    return v ? (f.unit ? `${v} ${f.unit}` : v) : null
  }).filter(Boolean)

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-800 leading-snug">{product.description}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {product.brand_name && (
              <span className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                {product.brand_name}
              </span>
            )}
            {product.uom && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                /{product.uom}
              </span>
            )}
          </div>
        </div>
        {specParts.length > 0 && (
          <div className="text-xs text-gray-500 mb-3">{specParts.join(' · ')}</div>
        )}

        {/* Prices */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">均價 Avg</div>
            <div className="text-base font-bold text-gray-800">
              {product.avg_unit_price != null ? `NT$${fmt(Math.round(product.avg_unit_price))}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">最低 Min</div>
            <div className="text-sm font-medium text-green-700">
              {product.min_unit_price != null ? `NT$${fmt(Math.round(product.min_unit_price))}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">最高 Max</div>
            <div className="text-sm font-medium text-red-700">
              {product.max_unit_price != null ? `NT$${fmt(Math.round(product.max_unit_price))}` : '—'}
            </div>
          </div>
        </div>

        {/* Spread bar */}
        <div className="mb-3">
          <SpreadBar
            min={product.min_unit_price}
            max={product.max_unit_price}
            avg={product.avg_unit_price}
          />
          {spreadPct(product.min_unit_price, product.max_unit_price, product.avg_unit_price) != null && (
            <div className="text-xs text-gray-400 mt-0.5">價格區間</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {product.quote_count != null && <span>{product.quote_count} 筆報價</span>}
            {product.latest_quote_date && (
              <span className="ml-2 text-gray-400">
                最新: {String(product.latest_quote_date).slice(0, 7)}
              </span>
            )}
          </div>
          <button
            onClick={onToggleExpand}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded transition-colors"
          >
            {expanded ? '收起 ▲' : '查看明細 ▼'}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-slate-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Spec attrs */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">規格屬性</div>
              <dl className="space-y-1.5">
                {attrDefs.map(f => (
                  <div key={f.attr_key} className="flex gap-2 text-xs">
                    <dt className="text-gray-400 w-16 shrink-0">{f.label_zh}</dt>
                    <dd className="font-medium text-gray-800">
                      {attrs[f.attr_key] || '—'}{attrs[f.attr_key] && f.unit ? ` ${f.unit}` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Vendor breakdown */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">廠商報價</div>
              {(product.vendors || []).length === 0 ? (
                <span className="text-xs text-gray-400">無廠商資料</span>
              ) : (
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-200">
                      <th className="text-left pb-1 font-normal">廠商名稱</th>
                      <th className="text-right pb-1 font-normal">均價</th>
                      <th className="text-right pb-1 font-normal">報價數</th>
                      <th className="text-right pb-1 font-normal">最新報價日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.vendors.map((v, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-1 pr-1">{v.vendor_name}</td>
                        <td className="text-right">{fmt(v.avg_price)}</td>
                        <td className="text-right">{v.quote_count}</td>
                        <td className="text-right text-gray-400">{v.last_quoted || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Vendor price chart */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">廠商均價比較</div>
              <VendorChart vendors={product.vendors} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── collapsible filter section ─────────────────────────────────────────────
function FilterSection({ sectionKey, label, collapsed, onToggle, children }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <span>{label}</span>
        <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && <div className="pb-3 space-y-1 pl-1">{children}</div>}
    </div>
  )
}

function CheckRow({ label, count, checked, onChange }) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer group py-0.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="rounded text-blue-600 border-gray-300"
        />
        <span className={`group-hover:text-blue-700 transition-colors ${checked ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
          {label}
        </span>
      </div>
      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full ml-2 shrink-0">
        {count}
      </span>
    </label>
  )
}

// ─── main component ──────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'quote_count_desc', label: '報價數 ↓' },
  { value: 'avg_price_asc',   label: '均價低→高' },
  { value: 'avg_price_desc',  label: '均價高→低' },
  { value: 'latest_desc',     label: '最新 ↓' },
]

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [families,      setFamilies]      = useState([])
  const [facets,        setFacets]        = useState(null)
  const [results,       setResults]       = useState([])
  const [meta,          setMeta]          = useState({ total: 0, pages: 0 })
  const [loading,       setLoading]       = useState(false)
  const [facetsLoading, setFacetsLoading] = useState(false)
  const [expandedCard,  setExpandedCard]  = useState(null)
  const [collapsed,     setCollapsed]     = useState(new Set())

  // ── derive state from URL ──────────────────────────────────────────────────
  const selectedFamily = searchParams.get('family')     || ''
  const sort           = searchParams.get('sort')       || 'quote_count_desc'
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const dateFrom       = searchParams.get('date_from')  || ''
  const dateTo         = searchParams.get('date_to')    || ''
  const brandIdsStr    = searchParams.get('brand_ids')  || ''
  const vendorIdsStr   = searchParams.get('vendor_ids') || ''
  const brandIds       = brandIdsStr  ? brandIdsStr.split(',')  : []
  const vendorIds      = vendorIdsStr ? vendorIdsStr.split(',') : []

  // Non-reserved params are attribute filter keys
  const attrFilters = {}
  for (const [k, v] of searchParams.entries()) {
    if (!RESERVED.has(k) && v) attrFilters[k] = v.split(',')
  }

  // ── helpers to mutate URL ──────────────────────────────────────────────────
  const patchParams = (updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') next.delete(k)
        else next.set(k, String(v))
      })
      return next
    }, { replace: true })
  }

  const setFamily = (code) => {
    setSearchParams(code ? new URLSearchParams({ family: code }) : new URLSearchParams(), { replace: true })
    setCollapsed(new Set())
    setExpandedCard(null)
  }

  const toggleAttrValue = (key, val) => {
    const cur = attrFilters[key] || []
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val]
    patchParams({ [key]: next.length ? next.join(',') : null, page: null })
    setExpandedCard(null)
  }

  const toggleBrandId = (id) => {
    const next = brandIds.includes(id) ? brandIds.filter(x => x !== id) : [...brandIds, id]
    patchParams({ brand_ids: next.length ? next.join(',') : null, page: null })
    setExpandedCard(null)
  }

  const toggleVendorId = (id) => {
    const next = vendorIds.includes(id) ? vendorIds.filter(x => x !== id) : [...vendorIds, id]
    patchParams({ vendor_ids: next.length ? next.join(',') : null, page: null })
    setExpandedCard(null)
  }

  const clearAll = () => {
    setSearchParams(
      selectedFamily ? new URLSearchParams({ family: selectedFamily }) : new URLSearchParams(),
      { replace: true }
    )
    setExpandedCard(null)
  }

  const toggleSection = (key) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── load families ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/products/families`)
      .then(r => r.json())
      .then(j => setFamilies(j.data || []))
      .catch(() => {})
  }, [])

  // ── load facets when family changes ───────────────────────────────────────
  useEffect(() => {
    if (!selectedFamily) { setFacets(null); return }
    setFacetsLoading(true)
    fetch(`${API_BASE}/products/facets?family_code=${encodeURIComponent(selectedFamily)}`)
      .then(r => r.json())
      .then(j => setFacets(j))
      .catch(() => setFacets(null))
      .finally(() => setFacetsLoading(false))
  }, [selectedFamily])

  // ── fetch results whenever any URL param changes ───────────────────────────
  const abortRef = useRef(null)
  useEffect(() => {
    if (!selectedFamily) { setResults([]); setMeta({ total: 0, pages: 0 }); return }

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setLoading(true)
    const p = new URLSearchParams({ family_code: selectedFamily, sort, page, page_size: 20 })
    if (dateFrom)          p.set('date_from',  dateFrom)
    if (dateTo)            p.set('date_to',    dateTo)
    if (brandIdsStr)       p.set('brand_ids',  brandIdsStr)
    if (vendorIdsStr)      p.set('vendor_ids', vendorIdsStr)

    const attrsPayload = {}
    for (const [k, v] of searchParams.entries()) {
      if (!RESERVED.has(k) && v) attrsPayload[k] = v.split(',')
    }
    if (Object.keys(attrsPayload).length) p.set('attrs', JSON.stringify(attrsPayload))

    fetch(`${API_BASE}/products/search?${p}`, { signal })
      .then(r => r.json())
      .then(j => { setResults(j.data || []); setMeta(j.meta || { total: 0, pages: 0 }) })
      .catch(e => { if (e.name !== 'AbortError') { setResults([]); setMeta({ total: 0, pages: 0 }) } })
      .finally(() => setLoading(false))

    return () => abortRef.current?.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  // ── active filter tags ─────────────────────────────────────────────────────
  const activeFilters = []
  if (facets) {
    facets.facets.forEach(f => {
      ;(attrFilters[f.attr_key] || []).forEach(v =>
        activeFilters.push({ key: `${f.attr_key}:${v}`, label: `${f.label_zh}: ${v}`, remove: () => toggleAttrValue(f.attr_key, v) })
      )
    })
    facets.brands
      .filter(b => brandIds.includes(b.brand_id))
      .forEach(b => activeFilters.push({ key: `brand:${b.brand_id}`, label: `廠牌: ${b.brand_name}`, remove: () => toggleBrandId(b.brand_id) }))
    facets.vendors
      .filter(v => vendorIds.includes(v.vendor_id))
      .forEach(v => activeFilters.push({ key: `vendor:${v.vendor_id}`, label: `廠商: ${v.vendor_name}`, remove: () => toggleVendorId(v.vendor_id) }))
  }
  if (dateFrom) activeFilters.push({ key: 'date_from', label: `從: ${dateFrom}`, remove: () => patchParams({ date_from: null, page: null }) })
  if (dateTo)   activeFilters.push({ key: 'date_to',   label: `至: ${dateTo}`,   remove: () => patchParams({ date_to: null,   page: null }) })

  // ── families grouped by discipline ────────────────────────────────────────
  const familiesByDisc = families.reduce((acc, f) => {
    if (!acc[f.discipline]) acc[f.discipline] = []
    acc[f.discipline].push(f)
    return acc
  }, {})

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex -mx-4 -mt-6" style={{ minHeight: 'calc(100vh - 56px)' }}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto sticky top-0"
             style={{ maxHeight: 'calc(100vh - 56px)' }}>

        {/* Family selector */}
        <div className="p-4 border-b border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">品項族系</div>
          {Object.keys(familiesByDisc).length === 0 ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(familiesByDisc).map(([disc, fams]) => (
                <div key={disc}>
                  <div className="text-xs text-gray-400 font-semibold px-1 mb-1">{disc}</div>
                  <div className="space-y-0.5">
                    {fams.map(f => (
                      <button
                        key={f.family_code}
                        onClick={() => setFamily(f.family_code)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedFamily === f.family_code
                            ? 'bg-blue-600 text-white font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {f.family_name_zh}
                        <span className="ml-1.5 text-xs opacity-50">({f.family_code})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">已選條件</span>
              <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700 transition-colors">
                全部清除
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {activeFilters.map(f => (
                <span key={f.key} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                  {f.label}
                  <button onClick={f.remove} className="text-gray-400 hover:text-gray-700 font-bold leading-none ml-0.5">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filter groups */}
        {selectedFamily && (
          <div className="flex-1 p-4 space-y-0">
            {facetsLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : facets ? (
              <>
                {/* Attribute facets */}
                {facets.facets.map(f => (
                  <FilterSection
                    key={f.attr_key}
                    sectionKey={f.attr_key}
                    label={<>{f.label_zh}{f.unit && <span className="text-xs text-gray-400 ml-1">({f.unit})</span>}</>}
                    collapsed={collapsed.has(f.attr_key)}
                    onToggle={toggleSection}
                  >
                    {f.options.map(opt => (
                      <CheckRow
                        key={opt.value}
                        label={opt.value}
                        count={opt.count}
                        checked={(attrFilters[f.attr_key] || []).includes(opt.value)}
                        onChange={() => toggleAttrValue(f.attr_key, opt.value)}
                      />
                    ))}
                  </FilterSection>
                ))}

                {/* Brand facet */}
                {facets.brands.length > 0 && (
                  <FilterSection
                    sectionKey="__brands__"
                    label="廠牌 Brand"
                    collapsed={collapsed.has('__brands__')}
                    onToggle={toggleSection}
                  >
                    {facets.brands.map(b => (
                      <CheckRow
                        key={b.brand_id}
                        label={b.brand_name}
                        count={b.count}
                        checked={brandIds.includes(b.brand_id)}
                        onChange={() => toggleBrandId(b.brand_id)}
                      />
                    ))}
                  </FilterSection>
                )}

                {/* Vendor facet */}
                {facets.vendors.length > 0 && (
                  <FilterSection
                    sectionKey="__vendors__"
                    label="廠商 Vendor"
                    collapsed={collapsed.has('__vendors__')}
                    onToggle={toggleSection}
                  >
                    {facets.vendors.map(v => (
                      <CheckRow
                        key={v.vendor_id}
                        label={v.vendor_name}
                        count={v.count}
                        checked={vendorIds.includes(v.vendor_id)}
                        onChange={() => toggleVendorId(v.vendor_id)}
                      />
                    ))}
                  </FilterSection>
                )}

                {/* Date range */}
                <FilterSection
                  sectionKey="__dates__"
                  label="報價日期"
                  collapsed={collapsed.has('__dates__')}
                  onToggle={toggleSection}
                >
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="text-xs text-gray-400">從</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => patchParams({ date_from: e.target.value || null, page: null })}
                        className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">至</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => patchParams({ date_to: e.target.value || null, page: null })}
                        className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                </FilterSection>
              </>
            ) : null}
          </div>
        )}

        {!selectedFamily && (
          <div className="flex-1 flex items-center justify-center p-6 text-xs text-gray-400 text-center">
            ← 選擇族系開始篩選
          </div>
        )}
      </aside>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col bg-gray-50">

        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="text-sm text-gray-600">
            {!selectedFamily ? (
              <span className="text-gray-400">← 請從左側選擇品項族系</span>
            ) : loading ? (
              <span className="text-gray-400 animate-pulse">搜尋中...</span>
            ) : (
              <span>找到 <strong className="text-gray-800">{meta.total}</strong> 筆報價</span>
            )}
          </div>
          {selectedFamily && (
            <select
              value={sort}
              onChange={e => patchParams({ sort: e.target.value, page: null })}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 p-6">
          {!selectedFamily ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-5xl mb-4 opacity-30">🔩</div>
              <div className="text-lg font-medium text-gray-500 mb-1">McMaster 式品項篩選</div>
              <div className="text-sm text-gray-400">從左側選擇品項族系，開始瀏覽歷史報價資料</div>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-4 opacity-30">📭</div>
              <div className="text-lg font-medium text-gray-600 mb-1">此條件下無報價資料</div>
              <div className="text-sm text-gray-400 mb-4">請嘗試放寬篩選條件</div>
              <button
                onClick={clearAll}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                清除篩選條件
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {results.map(product => (
                  <ProductCard
                    key={product.product_id}
                    product={product}
                    facets={facets}
                    expanded={expandedCard === product.product_id}
                    onToggleExpand={() =>
                      setExpandedCard(prev => prev === product.product_id ? null : product.product_id)
                    }
                  />
                ))}
              </div>

              {/* Pagination */}
              {meta.pages > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-8">
                  <button
                    disabled={page <= 1}
                    onClick={() => patchParams({ page: page - 1 })}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← 上頁
                  </button>
                  {Array.from({ length: Math.min(meta.pages, 7) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => patchParams({ page: p })}
                      className={`px-3 py-1.5 text-sm border rounded transition-colors ${
                        page === p
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  {meta.pages > 7 && <span className="px-2 text-gray-400">…</span>}
                  <button
                    disabled={page >= meta.pages}
                    onClick={() => patchParams({ page: page + 1 })}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    下頁 →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
