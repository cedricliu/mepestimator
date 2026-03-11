/**
 * Estimator App — React Router v6 with JWT-gated routes.
 * All non-login routes require a valid access token (estimator or admin role).
 * Token lives in useAuth state only — never localStorage.
 */

import { createContext, useContext, useMemo } from 'react'
import {
  BrowserRouter, Routes, Route, Navigate,
  NavLink, useNavigate,
} from 'react-router-dom'

import { useAuth }         from './hooks/useAuth'
import { createApiClient } from './api/client'

import Login    from './pages/Login'
import Dashboard from './pages/Dashboard'
import Upload   from './pages/Upload'
import Estimate from './pages/Estimate'
import Products from './pages/Products'

// -----------------------------------------------------------------------
// Auth + API context — shared across all pages
// -----------------------------------------------------------------------
export const AuthContext = createContext(null)
export const ApiContext  = createContext(null)

export function useAuthContext() { return useContext(AuthContext) }
export function useApi()         { return useContext(ApiContext) }

// -----------------------------------------------------------------------
// ProtectedRoute — redirects to /login if no token
// -----------------------------------------------------------------------
function ProtectedRoute({ children }) {
  const { token } = useAuthContext()
  return token ? children : <Navigate to="/login" replace />
}

// -----------------------------------------------------------------------
// NavBar
// -----------------------------------------------------------------------
function NavBar() {
  const { user, logout } = useAuthContext()
  const navigate = useNavigate()

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded font-medium transition-colors ${
      isActive
        ? 'bg-blue-900 text-white'
        : 'text-blue-100 hover:bg-blue-700'
    }`

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="bg-blue-800 text-white px-6 py-3 flex items-center gap-2 shadow-md">
      <span className="text-xl font-bold tracking-tight mr-6">⚡ MEP 報價系統</span>
      <NavLink to="/" end className={linkClass}>搜尋 Dashboard</NavLink>
      <NavLink to="/upload" className={linkClass}>上傳 Upload</NavLink>
      <NavLink to="/estimate" className={linkClass}>估價 Estimate</NavLink>
      <NavLink to="/products" className={linkClass}>品項 Products</NavLink>
      <div className="ml-auto flex items-center gap-4">
        {user && (
          <span className="text-sm text-blue-200">
            {user.display_name} ({user.role})
          </span>
        )}
        <button
          onClick={handleLogout}
          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
        >
          登出
        </button>
      </div>
    </nav>
  )
}

// -----------------------------------------------------------------------
// Inner app — needs navigate in scope for createApiClient
// -----------------------------------------------------------------------
function InnerApp({ auth }) {
  const navigate = useNavigate()

  const api = useMemo(
    () => createApiClient(() => auth.token, auth.refresh, navigate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth.token]
  )

  return (
    <AuthContext.Provider value={auth}>
      <ApiContext.Provider value={api}>
        <div className="min-h-screen bg-gray-50">
          {auth.token && <NavBar />}
          <main className="max-w-7xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
              />
              <Route
                path="/upload"
                element={<ProtectedRoute><Upload /></ProtectedRoute>}
              />
              <Route
                path="/estimate"
                element={<ProtectedRoute><Estimate /></ProtectedRoute>}
              />
              <Route
                path="/products"
                element={<ProtectedRoute><Products /></ProtectedRoute>}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </ApiContext.Provider>
    </AuthContext.Provider>
  )
}

// -----------------------------------------------------------------------
// Root — BrowserRouter wraps everything so useNavigate works
// -----------------------------------------------------------------------
export default function App() {
  const auth = useAuth()
  return (
    <BrowserRouter>
      <InnerApp auth={auth} />
    </BrowserRouter>
  )
}
