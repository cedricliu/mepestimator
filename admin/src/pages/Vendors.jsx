/**
 * Vendors.jsx — Vendor and brand registry (Sprint 6).
 *
 * Two tabs:
 *   Vendors — table from GET /vendors + inline "New Vendor" form (POST /vendors)
 *   Brands  — placeholder (no backend endpoint yet)
 *
 * POST /vendors request body: { vendor_code, vendor_name, discipline_codes, contact_name, contact_phone }
 */

import { useState, useEffect, useContext } from 'react'
import { ApiContext } from '../App'

const DISCIPLINES = ['ELEC', 'HVAC', 'PLUMB', 'FIRE', 'WEAK']
const DISCIPLINE_LABELS = {
  ELEC:  '電氣',
  HVAC:  '空調',
  PLUMB: '給排水',
  FIRE:  '消防',
  WEAK:  '弱電',
}

// ---------------------------------------------------------------------------
// DisciplineChip
// ---------------------------------------------------------------------------
function DisciplineChip({ code }) {
  const colors = {
    ELEC:  'bg-yellow-100 text-yellow-800',
    HVAC:  'bg-blue-100  text-blue-800',
    PLUMB: 'bg-green-100 text-green-800',
    FIRE:  'bg-red-100   text-red-800',
    WEAK:  'bg-gray-100  text-gray-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-1 ${colors[code] ?? 'bg-gray-100 text-gray-600'}`}>
      {DISCIPLINE_LABELS[code] ?? code}
    </span>
  )
}

// ---------------------------------------------------------------------------
// NewVendorForm — inline create form
// ---------------------------------------------------------------------------
function NewVendorForm({ api, onCreated, onCancel }) {
  const [form, setForm] = useState({
    vendor_code: '',
    vendor_name: '',
    discipline_codes: [],
    contact_name: '',
    contact_phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function toggleDiscipline(code) {
    setForm(f => ({
      ...f,
      discipline_codes: f.discipline_codes.includes(code)
        ? f.discipline_codes.filter(c => c !== code)
        : [...f.discipline_codes, code],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.vendor_code.trim() || !form.vendor_name.trim()) {
      setError('廠商代碼與廠商名稱為必填')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await api.post('/vendors', form)
      onCreated(data.data)
    } catch (err) {
      setError(err.response?.data?.detail || '建立失敗，請再試一次')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
      <h3 className="font-semibold text-blue-900 mb-4">新增廠商</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              廠商代碼 <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.vendor_code}
              onChange={e => setForm(f => ({ ...f, vendor_code: e.target.value.toUpperCase() }))}
              placeholder="VND001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              廠商名稱 <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.vendor_name}
              onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
              placeholder="台灣電機股份有限公司"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">專業類別</label>
          <div className="flex gap-2 flex-wrap">
            {DISCIPLINES.map(code => (
              <label key={code} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.discipline_codes.includes(code)}
                  onChange={() => toggleDiscipline(code)}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">{DISCIPLINE_LABELS[code]} ({code})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">聯絡人</label>
            <input
              value={form.contact_name}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
              placeholder="王大明"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">聯絡電話</label>
            <input
              type="tel"
              value={form.contact_phone}
              onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
              placeholder="02-1234-5678"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? '建立中…' : '建立廠商'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VendorsTab
// ---------------------------------------------------------------------------
function VendorsTab({ api }) {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/vendors')
      .then(({ data }) => setVendors(data.data))
      .catch(err => setError(err.response?.data?.detail || '載入廠商失敗'))
      .finally(() => setLoading(false))
  }, [api])

  function handleCreated(vendor) {
    setVendors(prev => [...prev, vendor])
    setShowForm(false)
  }

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{vendors.length} 家廠商</span>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {showForm ? '取消' : '新增廠商'}
        </button>
      </div>

      {/* New vendor inline form */}
      {showForm && (
        <NewVendorForm
          api={api}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">尚無廠商資料</p>
          <p className="text-sm mt-1">請新增廠商或上傳含廠商代碼的報價單</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-medium">廠商代碼</th>
                <th className="px-4 py-3 text-left font-medium">廠商名稱</th>
                <th className="px-4 py-3 text-left font-medium">專業類別</th>
                <th className="px-4 py-3 text-left font-medium">聯絡人</th>
                <th className="px-4 py-3 text-left font-medium">電話</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendors.map((v, i) => (
                <tr key={v.vendor_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium">
                    {v.vendor_code}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{v.vendor_name}</td>
                  <td className="px-4 py-3">
                    {(v.discipline_codes || []).map(code => (
                      <DisciplineChip key={code} code={code} />
                    ))}
                    {(!v.discipline_codes || v.discipline_codes.length === 0) && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.contact_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {v.contact_phone || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NewBrandForm — inline create form
// ---------------------------------------------------------------------------
function NewBrandForm({ api, onCreated, onCancel }) {
  const [form, setForm] = useState({
    brand_code: '',
    brand_name: '',
    brand_name_en: '',
    country_of_origin: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.brand_code.trim() || !form.brand_name.trim()) {
      setError('品牌代碼與品牌名稱為必填')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await api.post('/brands', form)
      onCreated(data.data)
    } catch (err) {
      setError(err.response?.data?.detail || '建立失敗，請再試一次')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
      <h3 className="font-semibold text-blue-900 mb-4">新增品牌</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              品牌代碼 <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.brand_code}
              onChange={e => setForm(f => ({ ...f, brand_code: e.target.value.toUpperCase() }))}
              placeholder="TECO"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              品牌名稱（中文）<span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.brand_name}
              onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
              placeholder="東元電機"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">品牌名稱（英文）</label>
            <input
              value={form.brand_name_en}
              onChange={e => setForm(f => ({ ...f, brand_name_en: e.target.value }))}
              placeholder="TECO Electric"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">原產地</label>
            <input
              value={form.country_of_origin}
              onChange={e => setForm(f => ({ ...f, country_of_origin: e.target.value }))}
              placeholder="台灣"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? '建立中…' : '建立品牌'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BrandsTab — GET /brands table + inline create form
// ---------------------------------------------------------------------------
function BrandsTab({ api }) {
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/brands')
      .then(({ data }) => setBrands(data.data))
      .catch(err => setError(err.response?.data?.detail || '載入品牌失敗'))
      .finally(() => setLoading(false))
  }, [api])

  function handleCreated(brand) {
    setBrands(prev => [...prev, brand])
    setShowForm(false)
  }

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{brands.length} 個品牌</span>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {showForm ? '取消' : '新增品牌'}
        </button>
      </div>

      {showForm && (
        <NewBrandForm api={api} onCreated={handleCreated} onCancel={() => setShowForm(false)} />
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {brands.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">尚無品牌資料</p>
          <p className="text-sm mt-1">請新增品牌</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-medium">品牌代碼</th>
                <th className="px-4 py-3 text-left font-medium">品牌名稱</th>
                <th className="px-4 py-3 text-left font-medium">英文名稱</th>
                <th className="px-4 py-3 text-left font-medium">原產地</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {brands.map((b, i) => (
                <tr key={b.brand_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium">
                    {b.brand_code}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{b.brand_name}</td>
                  <td className="px-4 py-3 text-gray-600">{b.brand_name_en || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.country_of_origin || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vendors page
// ---------------------------------------------------------------------------
export default function Vendors() {
  const api = useContext(ApiContext)
  const [activeTab, setActiveTab] = useState('vendors')

  const tabs = [
    { id: 'vendors', label: '廠商 Vendors' },
    { id: 'brands',  label: '品牌 Brands' },
  ]

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">廠商與品牌</h1>
        <p className="text-sm text-gray-500 mt-0.5">管理廠商登錄及品牌對應關係</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'vendors' && <VendorsTab api={api} />}
      {activeTab === 'brands'  && <BrandsTab api={api} />}
    </div>
  )
}
