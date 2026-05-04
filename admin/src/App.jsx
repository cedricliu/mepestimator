/**
 * Admin App — React Router v6 with JWT-gated routes.
 * All non-login routes require a valid access token (admin role).
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
import Products from './pages/Products'
import Families from './pages/Families'
import Upload   from './pages/Upload'
import Review   from './pages/Review'
import Vendors  from './pages/Vendors'
import Health   from './pages/Health'

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

  const link = ({ isActive }) =>
    `px-3 py-2 rounded font-medium text-sm transition-colors ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-200 hover:bg-gray-700'
    }`

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="bg-gray-800 text-white px-6 py-3 flex items-center gap-1 shadow-md flex-wrap">
      <span className="text-xl font-bold tracking-tight mr-5">
        MEP 管理後台
      </span>

      {/* Data pages */}
      <NavLink to="/products" className={link}>品項目錄</NavLink>
      <NavLink to="/families" className={link}>品類管理</NavLink>

      {/* Separator */}
      <span className="mx-2 text-gray-600 select-none">|</span>

      {/* Ingest pages */}
      <NavLink to="/upload" className={link}>上傳標單</NavLink>
      <NavLink to="/review" className={link}>待審查</NavLink>

      {/* Separator */}
      <span className="mx-2 text-gray-600 select-none">|</span>

      {/* Registry pages */}
      <NavLink to="/vendors" className={link}>廠商</NavLink>

      {/* Separator */}
      <span className="mx-2 text-gray-600 select-none">|</span>

      {/* System page */}
      <NavLink to="/health" className={link}>系統狀態</NavLink>

      <div className="ml-auto flex items-center gap-4">
        {user && (
          <span className="text-sm text-gray-300">
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
                path="/products"
                element={<ProtectedRoute><Products /></ProtectedRoute>}
              />
              <Route
                path="/families"
                element={<ProtectedRoute><Families /></ProtectedRoute>}
              />
              <Route
                path="/upload"
                element={<ProtectedRoute><Upload /></ProtectedRoute>}
              />
              <Route
                path="/review"
                element={<ProtectedRoute><Review /></ProtectedRoute>}
              />
              <Route
                path="/vendors"
                element={<ProtectedRoute><Vendors /></ProtectedRoute>}
              />
              <Route
                path="/health"
                element={<ProtectedRoute><Health /></ProtectedRoute>}
              />
              <Route path="/" element={<Navigate to="/products" replace />} />
              <Route path="*" element={<Navigate to="/products" replace />} />
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
    <BrowserRouter basename="/admin">
      <InnerApp auth={auth} />
    </BrowserRouter>
  )
}
