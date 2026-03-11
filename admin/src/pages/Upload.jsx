/**
 * Upload.jsx — Admin file upload page (Sprint 6).
 * Adapts frontend/src/pages/Upload.jsx with:
 *   - Admin API client (token injected automatically)
 *   - 5-bucket result summary (rows_loaded, rows_ok, rows_auto_created, rows_needs_review, rows_exception)
 *   - "View NEEDS_REVIEW" button navigating to /review
 *   - Collapsible exception detail table
 */

import { useState, useRef, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiContext } from '../App'

const ACCEPTED = ['csv', 'xlsx']

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function BucketBadge({ label, count, color }) {
  const colorMap = {
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
    green:  'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red:    'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`border rounded-lg px-4 py-3 text-center ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs mt-0.5">{label}</div>
    </div>
  )
}

export default function Upload() {
  const api = useContext(ApiContext)
  const navigate = useNavigate()

  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [showExceptions, setShowExceptions] = useState(false)
  const inputRef = useRef(null)

  function validateAndSet(f) {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!ACCEPTED.includes(ext)) {
      setFileError(`僅接受 CSV 或 XLSX 檔案（收到 .${ext}）`)
      setFile(null)
      return
    }
    setFileError(null)
    setFile(f)
    setResult(null)
    setApiError(null)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    validateAndSet(f)
  }

  async function handleUpload() {
    if (!file || !api) return
    setUploading(true)
    setApiError(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await api.post('/ingest/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(r.data.data)
      setShowExceptions(false)
    } catch (e) {
      const msg = e.response?.data?.detail || `HTTP ${e.response?.status || 'error'}`
      setApiError(msg)
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setFile(null)
    setFileError(null)
    setResult(null)
    setApiError(null)
    setShowExceptions(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">上傳標單 / Upload Bid Form</h1>
        <p className="text-sm text-gray-500 mt-1">支援 CSV 及 XLSX — 欄位別名自動識別繁中或英文表頭</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
      >
        <div className="text-5xl mb-3 select-none">📂</div>
        <p className="text-gray-600 font-medium">拖放檔案至此，或點擊選取</p>
        <p className="text-gray-400 text-sm mt-1">支援 CSV、XLSX</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={e => validateAndSet(e.target.files[0])}
        />
      </div>

      {/* File type error */}
      {fileError && (
        <div className="mt-3 bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm">
          {fileError}
        </div>
      )}

      {/* File preview */}
      {file && !fileError && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500">{fileSize(file.size)}</p>
          </div>
          <button
            onClick={reset}
            className="text-gray-400 hover:text-red-500 text-xl leading-none"
            aria-label="移除檔案"
          >
            ×
          </button>
        </div>
      )}

      {/* Upload button */}
      {file && !fileError && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className={`mt-4 w-full py-2.5 rounded-lg font-semibold text-white transition-colors
            ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'}`}
        >
          {uploading ? '上傳中…' : '上傳 Upload'}
        </button>
      )}

      {/* API error */}
      {apiError && (
        <div className="mt-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
          上傳失敗: {apiError}
        </div>
      )}

      {/* Result — 5-bucket summary */}
      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            <BucketBadge label="載入" count={result.rows_loaded} color="blue" />
            <BucketBadge label="成功" count={result.rows_ok} color="green" />
            <BucketBadge label="自動建立" count={result.rows_auto_created} color="purple" />
            <BucketBadge label="待審查" count={result.rows_needs_review} color="yellow" />
            <BucketBadge label="異常" count={result.rows_exception} color="red" />
          </div>

          {/* NEEDS_REVIEW action */}
          {result.rows_needs_review > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-yellow-800">
                有 <strong>{result.rows_needs_review}</strong> 筆資料需要審查確認
              </span>
              <button
                onClick={() => navigate('/review')}
                className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
              >
                前往審查 →
              </button>
            </div>
          )}

          {/* Exception table (collapsible) */}
          {result.rows_exception > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowExceptions(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm text-gray-700"
              >
                <span>異常明細 ({result.rows_exception} 筆)</span>
                <span>{showExceptions ? '▲ 收起' : '▼ 展開'}</span>
              </button>

              {showExceptions && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-yellow-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-16">行號</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">問題</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">原始值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.exceptions || []).map((ex, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-yellow-50/40'}>
                          <td className="px-3 py-2 text-gray-500">{ex.row_num}</td>
                          <td className="px-3 py-2 text-red-700">{ex.reason}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono break-all">
                            {JSON.stringify(ex.raw_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Upload another */}
          <button
            onClick={reset}
            className="text-sm text-blue-600 hover:underline"
          >
            + 上傳另一份檔案
          </button>
        </div>
      )}
    </div>
  )
}
