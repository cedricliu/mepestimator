/**
 * Families.jsx — Product family browser (read-only in Sprint 4).
 * Lists all product families from GET /products/families.
 * Each family expands to show its attribute_definitions from GET /products/attributes.
 */

import { useState, useEffect } from 'react'
import { useApi } from '../App'

const DISCIPLINE_LABELS = {
  ELEC:  '電氣',
  HVAC:  '空調',
  PLUMB: '給排水',
  FIRE:  '消防',
  WEAK:  '弱電',
}

const VALUE_TYPE_LABELS = {
  select: '選項',
  number: '數值',
  text:   '文字',
}

function AttributeTable({ attrs }) {
  if (!attrs || attrs.length === 0) {
    return <p className="text-sm text-gray-400 py-2">尚無屬性定義</p>
  }
  return (
    <table className="w-full text-sm border-collapse mt-2">
      <thead>
        <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
          <th className="px-3 py-2 border border-gray-200 font-medium">屬性鍵值</th>
          <th className="px-3 py-2 border border-gray-200 font-medium">中文標籤</th>
          <th className="px-3 py-2 border border-gray-200 font-medium">類型</th>
          <th className="px-3 py-2 border border-gray-200 font-medium">單位</th>
          <th className="px-3 py-2 border border-gray-200 font-medium">現有值</th>
        </tr>
      </thead>
      <tbody>
        {attrs.map(a => (
          <tr key={a.attr_key} className="hover:bg-gray-50">
            <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-blue-700">
              {a.attr_key}
            </td>
            <td className="px-3 py-2 border border-gray-200">{a.label_zh}</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-500">
              {VALUE_TYPE_LABELS[a.value_type] ?? a.value_type}
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-500">{a.unit ?? '—'}</td>
            <td className="px-3 py-2 border border-gray-200">
              {a.distinct_values?.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {a.distinct_values.slice(0, 8).map(v => (
                    <span key={v} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                      {v}
                    </span>
                  ))}
                  {a.distinct_values.length > 8 && (
                    <span className="text-xs text-gray-400">+{a.distinct_values.length - 8} more</span>
                  )}
                </div>
              ) : (
                <span className="text-gray-400 text-xs">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FamilyCard({ family, api }) {
  const [expanded, setExpanded] = useState(false)
  const [attrs, setAttrs]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function toggleExpand() {
    setExpanded(e => !e)
    if (!attrs && !loading) {
      setLoading(true)
      try {
        const { data } = await api.get(`/products/attributes?family_code=${family.family_code}`)
        setAttrs(data.data)
      } catch {
        setAttrs([])
      } finally {
        setLoading(false)
      }
    }
  }

  const disciplineLabel = DISCIPLINE_LABELS[family.discipline] ?? family.discipline

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={toggleExpand}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            family.discipline === 'ELEC'  ? 'bg-yellow-100 text-yellow-800' :
            family.discipline === 'HVAC'  ? 'bg-blue-100  text-blue-800'   :
            family.discipline === 'PLUMB' ? 'bg-green-100 text-green-800'  :
            family.discipline === 'FIRE'  ? 'bg-red-100   text-red-800'    :
                                            'bg-gray-100  text-gray-600'
          }`}>
            {disciplineLabel}
          </span>
          <div>
            <p className="font-semibold text-gray-800">{family.family_name_zh}</p>
            <p className="text-xs text-gray-400 font-mono">{family.family_code}</p>
          </div>
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100">
          {family.description && (
            <p className="text-sm text-gray-500 mt-2 mb-2">{family.description}</p>
          )}
          {loading ? (
            <div className="h-12 bg-gray-100 animate-pulse rounded mt-2" />
          ) : (
            <AttributeTable attrs={attrs} />
          )}
        </div>
      )}
    </div>
  )
}

export default function Families() {
  const api = useApi()
  const [families, setFamilies] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/products/families')
      .then(({ data }) => setFamilies(data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [api])

  const byDiscipline = families.reduce((acc, f) => {
    const d = f.discipline
    if (!acc[d]) acc[d] = []
    acc[d].push(f)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">品類管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">產品品類與屬性定義（Sprint 4 為唯讀，CRUD 於 Sprint 7）</p>
        </div>
        <span className="text-sm text-gray-400">{families.length} 個品類</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDiscipline).map(([disc, fams]) => (
            <section key={disc}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {DISCIPLINE_LABELS[disc] ?? disc} ({disc})
              </h2>
              <div className="space-y-2">
                {fams.map(f => (
                  <FamilyCard key={f.family_code} family={f} api={api} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
