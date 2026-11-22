import axios from 'axios'

// In development Vite proxies this route. On Vercel, set VITE_API_URL to the
// public Render service URL (for example: https://da-dino-clothing-api.onrender.com/api).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', withCredentials: true })
export const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

// Authentication uses an HttpOnly cookie. Keep this helper so existing
// callers stay simple; no bearer token is exposed to browser JavaScript.
export function authConfig() { return {} }

export default api
