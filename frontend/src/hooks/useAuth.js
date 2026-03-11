/**
 * useAuth — JWT access token in React useState (NEVER localStorage).
 * Refresh token lives in httpOnly cookie (never touched by JS).
 *
 * PRD §7.2 Auth Design:
 *  - Access token: 8h, stored in useState memory only
 *  - Refresh token: 7d, httpOnly cookie
 *  - On 401: silently POST /auth/refresh, retry once, then redirect /login
 */

import { useState, useCallback, useRef } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useAuth() {
  const [token, setToken]           = useState(null)
  const [user, setUser]             = useState(null)   // { role, display_name, email }
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const refreshPromise = useRef(null) // deduplicate concurrent refresh calls

  // ----------------------------------------------------------------
  // login — calls POST /auth/login, stores access token in state
  // ----------------------------------------------------------------
  const login = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, { email, password }, {
        withCredentials: true,   // receive httpOnly refresh_token cookie
      })
      setToken(data.access_token)
      setUser({ role: data.role, display_name: data.display_name, email })
      return { ok: true }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed'
      setError(msg)
      return { ok: false, error: msg }
    } finally {
      setLoading(false)
    }
  }, [])

  // ----------------------------------------------------------------
  // refresh — silently rotate tokens using httpOnly cookie
  // Deduplicates concurrent calls (only one inflight at a time)
  // ----------------------------------------------------------------
  const refresh = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current

    const p = axios
      .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setToken(data.access_token)
        return data.access_token
      })
      .catch(() => {
        setToken(null)
        setUser(null)
        return null
      })
      .finally(() => {
        refreshPromise.current = null
      })

    refreshPromise.current = p
    return p
  }, [])

  // ----------------------------------------------------------------
  // logout — revoke refresh token server-side, clear state
  // ----------------------------------------------------------------
  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`, {}, { withCredentials: true })
    } catch {
      // ignore — clear state regardless
    }
    setToken(null)
    setUser(null)
  }, [])

  return { token, user, loading, error, login, refresh, logout }
}
