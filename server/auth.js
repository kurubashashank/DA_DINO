import jwt from 'jsonwebtoken'
import User from './models/User.js'

const cookieName = 'da_dino_session'
const isProduction = process.env.NODE_ENV === 'production'
const localUsers = new Map()

function signingSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  return isProduction ? null : 'local-preview-only-do-not-deploy'
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value = '']) => [key, decodeURIComponent(value)]))
}

function cookieOptions() {
  const requestedSameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase()
  const sameSite = ['lax', 'strict', 'none'].includes(requestedSameSite) ? requestedSameSite : 'lax'
  // Never allow a production session cookie to travel without TLS. `SameSite=None`
  // additionally requires Secure in modern browsers, so this also protects an
  // accidentally incomplete production configuration.
  const secure = isProduction || process.env.COOKIE_SECURE === 'true' || sameSite === 'none'
  return { httpOnly: true, secure, sameSite, path: '/', maxAge: 1000 * 60 * 60 * 2 }
}

export function rememberLocalUser(user) { localUsers.set(user._id.toString(), user); return user }
export function forgetLocalUser(id) { localUsers.delete(id) }
export function sendSession(res, user, status = 200) {
  res.cookie(cookieName, issueToken(user), cookieOptions())
  return res.status(status).json({ user: safeUser(user) })
}
export function clearSession(res) {
  const { maxAge, ...options } = cookieOptions()
  res.clearCookie(cookieName, options)
  return res.status(204).end()
}
export function safeUser(user) { return { id: user.id || user._id?.toString(), name: user.name, email: user.email, role: user.role } }

export function issueToken(user) {
  const secret = signingSecret()
  if (!secret) throw new Error('JWT_SECRET is required in production.')
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion || 0 }, secret, { expiresIn: '2h', issuer: 'da-dino-clothing-api', audience: 'da-dino-clothing' })
}

export async function requireAuth(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[cookieName]
    if (!token) return res.status(401).json({ message: 'Authentication required.' })
    const secret = signingSecret()
    if (!secret) return res.status(503).json({ message: 'Authentication is not configured.' })
    const payload = jwt.verify(token, secret, { issuer: 'da-dino-clothing-api', audience: 'da-dino-clothing' })
    const mongoUser = User.db.readyState === 1 ? await User.findById(payload.sub).select('+tokenVersion') : null
    const user = mongoUser || localUsers.get(payload.sub)
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' })
    if ((user.tokenVersion || 0) !== payload.tv) return res.status(401).json({ message: 'Your session is no longer valid. Please sign in again.' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'You do not have permission for this action.' })
}
