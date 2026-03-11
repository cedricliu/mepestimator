/**
 * Products.jsx — Admin product catalogue
 *
 * Layout:
 *   Left panel  — family tabs + JSONB attribute filter checkboxes (from /products/facets)
 *   Right panel — product cards (product_code, description, attribute chips, price stats)
 *                 + "新增品項" button → inline create form (POST /products)
 */

import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../App'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function Chip({ label }) {
  return (
    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
      {label}
    </span>
  )
}

function PriceStat({ label, value }) {
  if (value == null) return null
  return (
    <span className="text-xs text-gray-500 mr-3">
      {label}: <span className="font-medium text-gray-700">NT${Number(value).toLocaleString()}</span>
    </span>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 bg-gray-200 rounded-lg" />
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------
// NewProductForm — inline form for POST /products
// -----------------------------------------------------------------------
function NewProductForm({ api, familyCode, families, onCreated, onCancel }) {
  const [form, setForm] = useState({
    family_code: familyCode || (families[0]?.family_code ?? ''),
    description: '',
    attributes: {},
  })
  const [attrInput, setAttrInput] = useState('{}')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    let attrs = {}
    try { attrs = JSON.parse(attrInput) } catch { setError('attributes 格式錯誤 (需為 JSON)'); return }

    setSubmitting(true)
    try {
      const { data } = await api.post('/products', { ...form, attributes: attrs })
      onCreated(data.data)
    } catch (err) {
      setError(err.response?.data?.detail || '建立失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
      <h3 className="font-semibold text-blue-900 mb-3">新增品項</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">品類</label>
            <select
              value={form.family_code}
              onChange={e => setForm(f => ({ ...f, family_code: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {families.map(f => (
                <option key={f.family_code} value={f.family_code}>
                  {f.family_name_zh} ({f.family_code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-medium text-gray-600 mb-1">品名規格</label>
            <input
              required
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="例：EMT電線管 3/4吋 鍍鋅"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            屬性 (JSON)
          </label>
          <input
            value={attrInput}
            onChange={e => setAttrInput(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
            placeholder='{"diameter":"3/4\"","material":"鍍鋅"}'
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {submitting ? '建立中…' : '建立'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

// -----------------------------------------------------------------------
// ProductCard
// -----------------------------------------------------------------------
function ProductCard({ product }) {
  const attrs = product.attributes || {}
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {product.product_code}
        </span>
        {product.brand_name && (
          <span className="text-xs text-gray-400">{product.brand_name}</span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-800 mt-1 mb-2">{product.description}</p>

      {/* Attribute chips */}
      <div className="mb-2">
        {Object.entries(attrs).map(([k, v]) => (
          <Chip key={k} label={`${k}: ${v}`} />
        ))}
      </div>

      {/* Price stats */}
      {product.avg_unit_price != null && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap">
          <PriceStat label="均價" value={product.avg_unit_price} />
          <PriceStat label="最低" value={product.min_unit_price} />
          <PriceStat label="最高" value={product.max_unit_price} />
          {product.quote_count && (
            <span className="text-xs text-gray-400 ml-auto">{product.quote_count} 筆報價</span>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// FilterPanel — family tabs + attribute checkboxes
// -----------------------------------------------------------------------
function FilterPanel({ families, selectedFamily, onFamilyChange, facets, selectedAttrs, onAttrChange }) {
  return (
    <aside className="w-64 flex-shrink-0">
      {/* Family tabs */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">品類</p>
        <div className="space-y-1">
          {families.map(f => (
            <button
              key={f.family_code}
              onClick={() => onFamilyChange(f.family_code)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedFamily === f.family_code
                  ? 'bg-gray-800 text-white font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f.family_name_zh}
              <span className="ml-1 text-xs opacity-60">({f.family_code})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attribute facets */}
      {facets.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">篩選屬性</p>
          <div className="space-y-3">
            {facets.map(facet => (
              <div key={facet.attr_key}>
                <p className="text-xs font-medium text-gray-700 mb-1">{facet.label_zh}</p>
                <div className="space-y-1">
                  {facet.options.map(opt => {
                    const checked = (selectedAttrs[facet.attr_key] || []).includes(opt.value)
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onAttrChange(facet.attr_key, opt.value, !checked)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-xs text-gray-600 flex-1">{opt.value}</span>
                        <span className="text-xs text-gray-400">{opt.count}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

// -----------------------------------------------------------------------
// Products page
// -----------------------------------------------------------------------
export default function Products() {
  const api = useApi()

  const [families, setFamilies]         = useState([])
  const [selectedFamily, setFamily]     = useState('')
  const [facets, setFacets]             = useState([])
  const [selectedAttrs, setSelectedAttrs] = useState({})
  const [products, setProducts]         = useState([])
  const [meta, setMeta]                 = useState({ total: 0, page: 1, pages: 0 })
  const [loading, setLoading]           = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [q, setQ]                       = useState('')

  // Load family list once
  useEffect(() => {
    api.get('/products/families')
      .then(({ data }) => {
        setFamilies(data.data)
        if (data.data.length > 0) setFamily(data.data[0].family_code)
      })
      .catch(() => {})
  }, [api])

  // Load facets when family changes
  useEffect(() => {
    if (!selectedFamily) return
    setSelectedAttrs({})
    api.get(`/products/facets?family_code=${selectedFamily}`)
      .then(({ data }) => setFacets(data.facets || []))
      .catch(() => setFacets([]))
  }, [api, selectedFamily])

  // Load products when family / attrs / q changes
  const loadProducts = useCallback(async (page = 1) => {
    if (!selectedFamily) return
    setLoading(true)
    try {
      const attrsParam = Object.keys(selectedAttrs).length
        ? encodeURIComponent(JSON.stringify(selectedAttrs))
        : ''
      const qParam = q ? `&q=${encodeURIComponent(q)}` : ''
      const { data } = await api.get(
        `/products/search?family_code=${selectedFamily}&page=${page}&page_size=20${qParam}${attrsParam ? `&attrs=${attrsParam}` : ''}`
      )
      setProducts(data.data)
      setMeta({ total: data.meta.total, page: data.meta.page, pages: data.meta.pages })
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [api, selectedFamily, selectedAttrs, q])

  useEffect(() => { loadProducts(1) }, [loadProducts])

  function handleAttrChange(key, value, checked) {
    setSelectedAttrs(prev => {
      const existing = prev[key] || []
      return {
        ...prev,
        [key]: checked ? [...existing, value] : existing.filter(v => v !== value),
      }
    })
  }

  function handleFamilyChange(fc) {
    setFamily(fc)
    setQ('')
  }

  function handleCreated(product) {
    setShowForm(false)
    setProducts(prev => [product, ...prev])
    setMeta(m => ({ ...m, total: m.total + 1 }))
  }

  return (
    <div className="flex gap-6">
      <FilterPanel
        families={families}
        selectedFamily={selectedFamily}
        onFamilyChange={handleFamilyChange}
        facets={facets}
        selectedAttrs={selectedAttrs}
        onAttrChange={handleAttrChange}
      />

      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadProducts(1)}
            placeholder="搜尋品名…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            onClick={() => loadProducts(1)}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors"
          >
            搜尋
          </button>
          <button
            onClick={() => setShowForm(s => !s)}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            {showForm ? '取消' : '新增品項'}
          </button>
        </div>

        {/* New product form */}
        {showForm && (
          <NewProductForm
            api={api}
            familyCode={selectedFamily}
            families={families}
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Stats bar */}
        <div className="flex items-center justify-between mb-3 text-sm text-gray-500">
          <span>共 {meta.total} 筆品項</span>
          {meta.pages > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: meta.pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => loadProducts(p)}
                  className={`px-2 py-1 rounded text-xs ${
                    p === meta.page ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product cards */}
        {loading ? (
          <Skeleton />
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">此品類尚無品項資料</p>
            <p className="text-sm mt-1">請上傳報價單或手動新增品項</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <ProductCard key={p.product_id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
