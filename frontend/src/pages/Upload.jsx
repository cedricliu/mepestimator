import { useState, useRef } from 'react'
import { API_BASE } from '../App'

const ACCEPTED = ['csv', 'xlsx']

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Upload() {
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
    if (!file) return
    setUploading(true)
    setApiError(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/ingest/upload`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setApiError(json.detail || `HTTP ${res.status}`)
      } else {
        setResult(json)
        setShowExceptions(false)
      }
    } catch (e) {
      setApiError(`網路錯誤: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setFile(null)
    setFileError(null)
    setResult(null)
    setApiError(null)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">上傳標單 / Upload Bid Form</h1>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
      >
        <div className="text-4xl mb-2">📂</div>
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
        <div className="mt-3 bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">
          {fileError}
        </div>
      )}

      {/* File preview */}
      {file && !fileError && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500">{fileSize(file.size)}</p>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-red-500 text-xl leading-none">×</button>
        </div>
      )}

      {/* Upload button */}
      {file && !fileError && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className={`mt-4 w-full py-2.5 rounded font-semibold text-white transition-colors
            ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'}`}
        >
          {uploading ? '上傳中...' : '上傳 Upload'}
        </button>
      )}

      {/* API error */}
      {apiError && (
        <div className="mt-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded text-sm">
          上傳失敗: {apiError}
        </div>
      )}

      {/* Result card */}
      {result && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-gray-50 px-4 py-3 flex items-center gap-6 border-b">
            <span className="text-gray-600 text-sm">共載入 <strong>{result.rows_loaded}</strong> 列</span>
            <span className="text-green-700 font-medium">✓ {result.rows_ok} 筆成功</span>
            {result.rows_exception > 0 && (
              <span className="text-yellow-700 font-medium">⚠ {result.rows_exception} 筆異常</span>
            )}
          </div>

          {/* Exception table */}
          {result.rows_exception > 0 && (
            <div className="px-4 py-3">
              <button
                onClick={() => setShowExceptions(v => !v)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showExceptions ? '▲ 收起' : '▼ 展開異常明細'}
              </button>
              {showExceptions && (
                <div className="mt-3 overflow-x-auto rounded border border-yellow-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-yellow-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">行號</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">問題</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">原始值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.exceptions.map((ex, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-yellow-50/50'}>
                          <td className="px-3 py-1.5 text-gray-500">{ex.row_num}</td>
                          <td className="px-3 py-1.5 text-red-700">{ex.reason}</td>
                          <td className="px-3 py-1.5 text-gray-600 font-mono">
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
        </div>
      )}

      {/* Upload another */}
      {result && (
        <button
          onClick={reset}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          ＋ 上傳另一份檔案
        </button>
      )}
    </div>
  )
}
