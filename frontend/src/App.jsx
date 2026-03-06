import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Estimate from './pages/Estimate'
import Products from './pages/Products'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function NavBar() {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded font-medium transition-colors ${
      isActive
        ? 'bg-blue-900 text-white'
        : 'text-blue-100 hover:bg-blue-700'
    }`
  return (
    <nav className="bg-blue-800 text-white px-6 py-3 flex items-center gap-2 shadow-md">
      <span className="text-xl font-bold tracking-tight mr-6">⚡ MEP 報價系統</span>
      <NavLink to="/" end className={linkClass}>搜尋 Dashboard</NavLink>
      <NavLink to="/upload" className={linkClass}>上傳 Upload</NavLink>
      <NavLink to="/estimate" className={linkClass}>估價 Estimate</NavLink>
      <NavLink to="/products" className={linkClass}>品項 Products</NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/estimate" element={<Estimate />} />
            <Route path="/products" element={<Products />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
