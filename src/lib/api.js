import axios from 'axios'

// In development Vite proxies /api to the local server.  On Vercel the
// VITE_API_URL env var points to the Render backend.  Ensure the baseURL
// always ends with /api so axios paths like '/products' resolve correctly
// to <host>/api/products regardless of whether the env var includes it.
function resolveBaseURL() {
  const raw = import.meta.env.VITE_API_URL
  if (!raw) return '/api'                        // local dev — use Vite proxy
  const trimmed = raw.replace(/\/+$/, '')        // strip trailing slashes
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const api = axios.create({ baseURL: resolveBaseURL(), withCredentials: true })
export const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

// Authentication uses an HttpOnly cookie. Keep this helper so existing
// callers stay simple; no bearer token is exposed to browser JavaScript.
export function authConfig() { return {} }

export default api
