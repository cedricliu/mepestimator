/**
 * Axios instance for Estimator API.
 * - Injects Authorization: Bearer <token> header on every request
 * - On 401: silently calls /auth/refresh (via httpOnly cookie), retries once
 * - On second 401: redirects to /login
 *
 * Usage:
 *   import { createApiClient } from '../api/client'
 *   const api = createApiClient(getToken, refresh, navigate)
 */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * createApiClient — factory called once in App.jsx, passed down via context.
 * @param {() => string|null}  getToken  — returns current access token from state
 * @param {() => Promise}      refresh   — calls POST /auth/refresh, returns new token or null
 * @param {(path: string) => void} navigate — react-router navigate
 */
export function createApiClient(getToken, refresh, navigate) {
  const instance = axios.create({
    baseURL: API_BASE,
    withCredentials: true,   // send httpOnly cookie on /auth/* endpoints
  })

  // Request interceptor: attach Bearer token
  instance.interceptors.request.use((config) => {
    const t = getToken()
    if (t) {
      config.headers['Authorization'] = `Bearer ${t}`
    }
    return config
  })

  // Response interceptor: handle 401 with silent refresh + retry
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config

      if (error.response?.status === 401 && !original._retry) {
        original._retry = true
        const newToken = await refresh()
        if (newToken) {
          original.headers['Authorization'] = `Bearer ${newToken}`
          return instance(original)
        }
        // Refresh failed — token gone, go to login
        navigate('/login')
      }

      return Promise.reject(error)
    }
  )

  return instance
}
