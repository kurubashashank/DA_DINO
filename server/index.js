import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import streamifier from 'streamifier'
import { fileTypeFromBuffer } from 'file-type'
import { z } from 'zod'
import Product from './models/Product.js'
import User from './models/User.js'
import CustomOrder from './models/CustomOrder.js'
import Offer from './models/Offer.js'
import Announcement from './models/Announcement.js'
import { sampleProducts } from './data/sampleProducts.js'
import { clearSession, rememberLocalUser, requireAuth, requireRole, safeUser, sendSession } from './auth.js'

const app = express()
const port = Number(process.env.PORT || 5000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const configuredOrigins = (process.env.CLIENT_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean)
if (isProduction && !configuredOrigins.length) throw new Error('CLIENT_ORIGIN must be configured in production.')
const allowedOrigins = configuredOrigins.length ? configuredOrigins : ['http://localhost:5173']
let mongoReady = false
let localProducts = sampleProducts.map((product, index) => ({ ...product, _id: `demo-${index + 1}`, createdAt: new Date(Date.now() - index * 86400000), updatedAt: new Date() }))
let localOrders = []
let localCustomers = []
let localOffers = [{ _id: 'offer-welcome', title: 'Welcome offer', code: 'WELCOME10', description: '10% off your first DA_DINO_clothing order.', type: 'percentage', value: 10, minimumOrder: 0, status: 'active', expiresAt: null, createdAt: new Date(), updatedAt: new Date() }]
let localAnnouncements = [{ _id: 'announcement-welcome', message: 'Welcome Offer: WELCOME10 — 10% off your first DA_DINO_clothing order. Bulk orders welcome.', enabled: true, mode: 'scroll', scrollSpeed: 'normal', linkText: 'Shop now', linkUrl: '/shop', openInNewTab: false, startsAt: null, endsAt: null, priority: 100, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() }]

// Render sits behind a reverse proxy. This keeps rate limiting tied to the
// client address rather than the proxy address.
app.set('trust proxy', 1)
mongoose.set('sanitizeFilter', true)
mongoose.set('strictQuery', true)

if (!process.env.JWT_SECRET && isProduction) throw new Error('JWT_SECRET must be configured in production.')
if (!process.env.JWT_SECRET && !isProduction) {
  console.warn('JWT_SECRET is not set. Admin authentication is disabled until it is configured.')
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: isProduction ? { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } } : false
}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed by CORS.'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}))
app.use(express.json({ limit: '100kb', strict: true }))
// Playwright uses a dedicated, non-production process for exhaustive viewport
// sweeps. Keeping that traffic out of the in-memory limiter makes the tests
// deterministic without weakening any normal development or production run.
const skipRateLimitForBrowserTests = () => process.env.PLAYWRIGHT_TEST === 'true'
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: 'draft-8', legacyHeaders: false, skip: skipRateLimitForBrowserTests, message: { message: 'Too many requests. Please try again later.' } }))

function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin')
  if (!origin && !isProduction) return next()
  if (origin && allowedOrigins.includes(origin)) return next()
  return res.status(403).json({ message: 'Request origin is not allowed.' })
}

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  // Production accepts state changes only from the storefront origin. In local
  // development this is also enforced for cookie-authenticated requests.
  if (isProduction || req.headers.cookie?.includes('da_dino_session=')) return requireTrustedOrigin(req, res, next)
  return next()
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 2, fieldSize: 10 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype))
})
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many uploads. Please try again later.' } })
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
})

const productInput = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
  category: z.string().trim().min(2).max(80),
  subcategory: z.string().trim().max(80).optional().default(''),
  description: z.string().trim().min(10).max(5000),
  sellingPrice: z.coerce.number().min(0),
  originalPrice: z.coerce.number().min(0).optional().nullable(),
  sizes: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  colors: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  sku: z.string().trim().min(2).max(80),
  stock: z.coerce.number().int().min(0),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  images: z.array(z.object({ url: z.string().url(), publicId: z.string().optional(), alt: z.string().max(200).optional(), isPrimary: z.boolean().optional() })).min(1).max(8),
  featured: z.boolean().default(false),
  status: z.enum(['published', 'draft']).default('draft')
}).superRefine((product, ctx) => {
  if (product.originalPrice != null && product.originalPrice < product.sellingPrice) ctx.addIssue({ code: 'custom', path: ['originalPrice'], message: 'Original price cannot be lower than selling price.' })
  if (product.images.filter(image => image.isPrimary).length !== 1) ctx.addIssue({ code: 'custom', path: ['images'], message: 'Select exactly one main product image.' })
})

function cleanProductBody(body) {
  const parseList = value => Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : []
  let images = body.images
  if (typeof images === 'string') { try { images = JSON.parse(images) } catch { images = undefined } }
  return {
    name: body.name, slug: body.slug, category: body.category, subcategory: body.subcategory, description: body.description,
    sellingPrice: body.sellingPrice, originalPrice: body.originalPrice, sizes: parseList(body.sizes), colors: parseList(body.colors), sku: body.sku,
    stock: body.stock, tags: parseList(body.tags), images, featured: body.featured === true || body.featured === 'true', status: body.status
  }
}

function publicProduct(product) {
  const data = product.toObject ? product.toObject() : product
  return { ...data, id: data._id?.toString() || data.id, _id: undefined }
}

async function removeCloudinaryImages(images = []) {
  const publicIds = images.map(image => image.publicId).filter(publicId => typeof publicId === 'string' && publicId.startsWith('da-dino-clothing-products/'))
  if (!publicIds.length || !process.env.CLOUDINARY_CLOUD_NAME) return
  const results = await Promise.allSettled(publicIds.map(publicId => cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })))
  results.filter(result => result.status === 'rejected').forEach(result => console.error('Cloudinary cleanup failed:', result.reason?.message || 'unknown error'))
}

async function removeCustomOrderImage(publicId) {
  if (!publicId || !publicId.startsWith('da-dino-clothing-custom-orders/') || !process.env.CLOUDINARY_CLOUD_NAME) return
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
  } catch (error) {
    console.error('Custom-order image cleanup failed:', error?.message || 'unknown error')
  }
}

async function findPublicProducts(query) {
  const { category, search, minPrice, maxPrice, sort = 'newest', featured } = query
  if (mongoReady) {
    const filter = { status: 'published' }
    if (category && category !== 'all') filter.category = category
    if (featured === 'true') filter.featured = true
    if (search) filter.$text = { $search: search }
    if (minPrice || maxPrice) filter.sellingPrice = { ...(minPrice ? { $gte: Number(minPrice) } : {}), ...(maxPrice ? { $lte: Number(maxPrice) } : {}) }
    const sortMap = { 'price-asc': { sellingPrice: 1 }, 'price-desc': { sellingPrice: -1 }, oldest: { createdAt: 1 }, newest: { createdAt: -1 } }
    return Product.find(filter).sort(sortMap[sort] || sortMap.newest).lean()
  }
  let list = localProducts.filter(product => product.status === 'published')
  if (category && category !== 'all') list = list.filter(product => product.category === category)
  if (featured === 'true') list = list.filter(product => product.featured)
  if (search) { const term = search.toLowerCase(); list = list.filter(product => `${product.name} ${product.description} ${product.tags.join(' ')}`.toLowerCase().includes(term)) }
  if (minPrice) list = list.filter(product => product.sellingPrice >= Number(minPrice))
  if (maxPrice) list = list.filter(product => product.sellingPrice <= Number(maxPrice))
  const comparators = { 'price-asc': (a, b) => a.sellingPrice - b.sellingPrice, 'price-desc': (a, b) => b.sellingPrice - a.sellingPrice, oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) }
  return list.sort(comparators[sort] || comparators.newest)
}

app.get('/api/health', (_req, res) => res.json({
  ok: mongoReady || !isProduction,
  database: isProduction ? (mongoReady ? 'mongodb-atlas' : 'unavailable') : (mongoReady ? 'mongodb-atlas' : 'demo-fallback'),
  cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  uptimeSeconds: Math.round(process.uptime())
}))

app.get('/api/products', async (req, res, next) => {
  try { res.json((await findPublicProducts(req.query)).map(publicProduct)) } catch (error) { next(error) }
})

app.get('/api/products/:slug', async (req, res, next) => {
  try {
    const product = mongoReady
      ? await Product.findOne({ slug: req.params.slug, status: 'published' }).lean()
      : localProducts.find(item => item.slug === req.params.slug && item.status === 'published')
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    res.json(publicProduct(product))
  } catch (error) { next(error) }
})

app.get('/api/offers', async (_req, res, next) => {
  try {
    const now = new Date()
    const offers = mongoReady
      ? await Offer.find({ status: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] }).sort({ createdAt: -1 }).lean()
      : localOffers.filter(offer => offer.status === 'active' && (!offer.expiresAt || new Date(offer.expiresAt) >= now))
    res.json(offers.map(publicProduct))
  } catch (error) { next(error) }
})

function sortAnnouncements(items) {
  return [...items].sort((a, b) => b.priority - a.priority || a.displayOrder - b.displayOrder || new Date(b.updatedAt) - new Date(a.updatedAt))
}

app.get('/api/announcements', async (_req, res, next) => {
  try {
    const now = new Date()
    const announcements = mongoReady
      ? await Announcement.find({ enabled: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }] }).lean()
      : localAnnouncements.filter(item => item.enabled && (!item.startsAt || new Date(item.startsAt) <= now) && (!item.endsAt || new Date(item.endsAt) >= now))
    res.json(sortAnnouncements(announcements).map(publicProduct))
  } catch (error) { next(error) }
})

app.post('/api/custom-orders/reference-image', uploadLimiter, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Upload a JPEG, PNG, WebP, or AVIF image no larger than 5 MB.' })
    const detectedType = await fileTypeFromBuffer(req.file.buffer)
    if (!detectedType || !allowedImageTypes.has(detectedType.mime) || detectedType.mime !== req.file.mimetype) {
      return res.status(400).json({ message: 'The uploaded file is not a valid supported image.' })
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ message: 'Image uploads are not configured.' })
    }
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: 'da-dino-clothing-custom-orders',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        transformation: [{ width: 2400, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }]
      }, (error, uploadResult) => error ? reject(error) : resolve(uploadResult))
      streamifier.createReadStream(req.file.buffer).pipe(stream)
    })
    res.status(201).json({ url: result.secure_url, publicId: result.public_id })
  } catch (error) { next(error) }
})

app.post('/api/custom-orders', rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res, next) => {
  try {
    const order = z.object({
      productType: z.string().min(2).max(80), quantity: z.coerce.number().int().min(1).max(10000), size: z.string().max(50).optional(),
      details: z.string().min(10).max(3000), customerName: z.string().min(2).max(100), email: z.string().email(), phone: z.string().max(30).optional(),
      referenceUrl: z.string().url().optional().or(z.literal('')),
      referencePublicId: z.string().regex(/^da-dino-clothing-custom-orders\/[A-Za-z0-9_-]+$/).optional()
    }).parse(req.body)
    if (mongoReady) await CustomOrder.create(order)
    else localOrders.unshift({ ...order, _id: `request-${Date.now()}`, createdAt: new Date(), status: 'new' })
    res.status(201).json({ message: 'Request received. Our studio will get back to you with a quote.' })
  } catch (error) { next(error) }
})

app.delete('/api/admin/custom-orders/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!mongoReady) return res.status(503).json({ message: 'Custom orders require a configured MongoDB database.' })
    const order = await CustomOrder.findById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Custom order not found.' })
    await CustomOrder.findByIdAndDelete(req.params.id)
    void removeCustomOrderImage(order.referencePublicId)
    res.status(204).end()
  } catch (error) { next(error) }
})

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts. Please wait before trying again.' } })
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    if (!mongoReady || !process.env.JWT_SECRET) return res.status(503).json({ message: 'Admin login requires a configured MongoDB connection and JWT secret.' })
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(8).max(200) }).parse(req.body)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash')
    if (!user || !['admin', 'editor'].includes(user.role) || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password.' })
    return sendSession(res, user)
  } catch (error) { next(error) }
})

const customerAuthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts. Please wait before trying again.' } })
const customerInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(30).optional()
})
const cartItemInput = z.object({
  productId: z.string().trim().min(1).max(128),
  size: z.string().trim().max(50).optional().default(''),
  color: z.string().trim().max(50).optional().default(''),
  quantity: z.coerce.number().int().min(1).max(100)
})
const cartLineInput = cartItemInput.pick({ productId: true, size: true, color: true })
const wishlistInput = z.object({ productId: z.string().trim().min(1).max(128) })

function cartSummary(product, item) {
  const data = product.toObject ? product.toObject() : product
  const image = data.images?.find(entry => entry.isPrimary)?.url || data.images?.[0]?.url || ''
  return { id: data._id?.toString() || data.id, slug: data.slug, name: data.name, image, price: data.sellingPrice, size: item.size || '', color: item.color || '', quantity: item.quantity, stock: data.stock }
}

async function publishedProductById(id) {
  if (mongoReady) {
    if (!mongoose.isObjectIdOrHexString(id)) return null
    return Product.findOne({ _id: id, status: 'published' }).lean()
  }
  return localProducts.find(product => product._id === id && product.status === 'published') || null
}

function ensureAllowedVariant(product, { size, color }) {
  if (size && product.sizes?.length && !product.sizes.includes(size)) return 'That size is not available for this product.'
  if (color && product.colors?.length && !product.colors.includes(color)) return 'That colour is not available for this product.'
  return null
}

async function cartForCustomer(user) {
  if (mongoReady) {
    const stored = await User.findById(user.id).populate({ path: 'cart.product', match: { status: 'published' } })
    return stored?.cart.filter(line => line.product).map(line => cartSummary(line.product, line)) || []
  }
  return (user.cart || []).map(line => {
    const product = localProducts.find(item => item._id === line.productId && item.status === 'published')
    return product ? cartSummary(product, line) : null
  }).filter(Boolean)
}

async function wishlistForCustomer(user) {
  if (mongoReady) {
    const stored = await User.findById(user.id).populate({ path: 'wishlist', match: { status: 'published' }, select: '_id' })
    return stored?.wishlist.filter(Boolean).map(product => product._id.toString()) || []
  }
  return (user.wishlist || []).filter(id => localProducts.some(product => product._id === id && product.status === 'published'))
}

app.post('/api/customers/register', customerAuthLimiter, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production' && (!mongoReady || !process.env.JWT_SECRET)) return res.status(503).json({ message: 'Customer accounts are available once the secure production database is configured.' })
    const { name, email, password, phone } = customerInput.parse(req.body)
    const emailAddress = email.toLowerCase()
    if (mongoReady && await User.exists({ email: emailAddress })) return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' })
    if (!mongoReady && localCustomers.some(customer => customer.email === emailAddress)) return res.status(409).json({ message: 'Unable to create an account with those details.' })
    const user = mongoReady
      ? await User.create({ name, email: emailAddress, phone, passwordHash: await bcrypt.hash(password, 12), role: 'customer' })
      : { _id: `local-customer-${Date.now()}`, name, email: emailAddress, phone, passwordHash: await bcrypt.hash(password, 12), role: 'customer', tokenVersion: 0, cart: [], wishlist: [] }
    if (!mongoReady) { localCustomers.push(user); rememberLocalUser(user) }
    return sendSession(res, user, 201)
  } catch (error) { next(error) }
})

app.post('/api/customers/login', customerAuthLimiter, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production' && (!mongoReady || !process.env.JWT_SECRET)) return res.status(503).json({ message: 'Customer accounts are available once the secure production database is configured.' })
    const { email, password } = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) }).parse(req.body)
    const user = mongoReady ? await User.findOne({ email: email.toLowerCase() }).select('+passwordHash') : localCustomers.find(customer => customer.email === email.toLowerCase())
    if (!user || user.role !== 'customer' || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password.' })
    return sendSession(res, user)
  } catch (error) { next(error) }
})

app.get('/api/customers/me', requireAuth, requireRole('customer'), (req, res) => {
  res.json({ user: safeUser(req.user) })
})

app.get('/api/customers/cart', requireAuth, requireRole('customer'), async (req, res, next) => {
  try { res.json({ items: await cartForCustomer(req.user) }) } catch (error) { next(error) }
})

app.post('/api/customers/cart', requireAuth, requireRole('customer'), async (req, res, next) => {
  try {
    const input = cartItemInput.parse(req.body)
    const product = await publishedProductById(input.productId)
    if (!product) return res.status(404).json({ message: 'This product is no longer available.' })
    const variantError = ensureAllowedVariant(product, input)
    if (variantError) return res.status(400).json({ message: variantError })
    if (mongoReady) {
      const user = await User.findById(req.user.id)
      const line = user.cart.find(item => item.product.toString() === product._id.toString() && item.size === input.size && item.color === input.color)
      const nextQuantity = (line?.quantity || 0) + input.quantity
      if (nextQuantity > product.stock) return res.status(400).json({ message: 'Requested quantity exceeds available stock.' })
      if (line) line.quantity = nextQuantity
      else { if (user.cart.length >= 50) return res.status(400).json({ message: 'Your bag has reached its 50-item limit.' }); user.cart.push({ product: product._id, size: input.size, color: input.color, quantity: input.quantity }) }
      await user.save()
    } else {
      const line = req.user.cart.find(item => item.productId === product._id && item.size === input.size && item.color === input.color)
      const nextQuantity = (line?.quantity || 0) + input.quantity
      if (nextQuantity > product.stock) return res.status(400).json({ message: 'Requested quantity exceeds available stock.' })
      if (line) line.quantity = nextQuantity
      else { if (req.user.cart.length >= 50) return res.status(400).json({ message: 'Your bag has reached its 50-item limit.' }); req.user.cart.push({ productId: product._id, size: input.size, color: input.color, quantity: input.quantity }) }
    }
    res.status(201).json({ items: await cartForCustomer(req.user) })
  } catch (error) { next(error) }
})

app.put('/api/customers/cart', requireAuth, requireRole('customer'), async (req, res, next) => {
  try {
    const input = cartItemInput.parse(req.body)
    const product = await publishedProductById(input.productId)
    if (!product) return res.status(404).json({ message: 'This product is no longer available.' })
    const variantError = ensureAllowedVariant(product, input)
    if (variantError) return res.status(400).json({ message: variantError })
    if (input.quantity > product.stock) return res.status(400).json({ message: 'Requested quantity exceeds available stock.' })
    if (mongoReady) {
      const user = await User.findById(req.user.id)
      const line = user.cart.find(item => item.product.toString() === product._id.toString() && item.size === input.size && item.color === input.color)
      if (!line) return res.status(404).json({ message: 'Cart item not found.' })
      line.quantity = input.quantity; await user.save()
    } else {
      const line = req.user.cart.find(item => item.productId === product._id && item.size === input.size && item.color === input.color)
      if (!line) return res.status(404).json({ message: 'Cart item not found.' })
      line.quantity = input.quantity
    }
    res.json({ items: await cartForCustomer(req.user) })
  } catch (error) { next(error) }
})

app.delete('/api/customers/cart', requireAuth, requireRole('customer'), async (req, res, next) => {
  try {
    const input = cartLineInput.parse(req.body)
    if (mongoReady) {
      const user = await User.findById(req.user.id)
      const before = user.cart.length
      user.cart = user.cart.filter(item => !(item.product.toString() === input.productId && item.size === input.size && item.color === input.color))
      if (user.cart.length === before) return res.status(404).json({ message: 'Cart item not found.' })
      await user.save()
    } else {
      const before = req.user.cart.length
      req.user.cart = req.user.cart.filter(item => !(item.productId === input.productId && item.size === input.size && item.color === input.color))
      if (req.user.cart.length === before) return res.status(404).json({ message: 'Cart item not found.' })
    }
    res.json({ items: await cartForCustomer(req.user) })
  } catch (error) { next(error) }
})

app.get('/api/customers/wishlist', requireAuth, requireRole('customer'), async (req, res, next) => {
  try { res.json({ productIds: await wishlistForCustomer(req.user) }) } catch (error) { next(error) }
})

app.post('/api/customers/wishlist', requireAuth, requireRole('customer'), async (req, res, next) => {
  try {
    const { productId } = wishlistInput.parse(req.body)
    if (mongoReady) {
      const user = await User.findById(req.user.id)
      const index = user.wishlist.findIndex(id => id.toString() === productId)
      if (index >= 0) user.wishlist.splice(index, 1)
      else {
        const product = await publishedProductById(productId)
        if (!product) return res.status(404).json({ message: 'This product is no longer available.' })
        if (user.wishlist.length >= 100) return res.status(400).json({ message: 'Your wishlist has reached its 100-item limit.' })
        user.wishlist.push(product._id)
      }
      await user.save()
    } else {
      const index = req.user.wishlist.indexOf(productId)
      if (index >= 0) req.user.wishlist.splice(index, 1)
      else {
        const product = await publishedProductById(productId)
        if (!product) return res.status(404).json({ message: 'This product is no longer available.' })
        if (req.user.wishlist.length >= 100) return res.status(400).json({ message: 'Your wishlist has reached its 100-item limit.' })
        req.user.wishlist.push(product._id)
      }
    }
    res.json({ productIds: await wishlistForCustomer(req.user) })
  } catch (error) { next(error) }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }))

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    if (mongoReady) await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } })
    else req.user.tokenVersion = (req.user.tokenVersion || 0) + 1
    return clearSession(res)
  } catch (error) { next(error) }
})

// Deliberately disabled unless a deployment operator opts in with a secret setup key.
app.post('/api/auth/setup', authLimiter, async (req, res, next) => {
  try {
    if (!mongoReady || process.env.ALLOW_ADMIN_SETUP !== 'true') return res.status(403).json({ message: 'Initial admin setup is disabled.' })
    const { setupKey, name, email, password } = z.object({ setupKey: z.string(), name: z.string().min(2), email: z.string().email(), password: z.string().min(12) }).parse(req.body)
    if (setupKey !== process.env.ADMIN_SETUP_KEY) return res.status(403).json({ message: 'Invalid setup key.' })
    if (await User.exists({})) return res.status(409).json({ message: 'An administrator already exists.' })
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: 'admin' })
    return sendSession(res, user, 201)
  } catch (error) { next(error) }
})

app.post('/api/auth/admin-signup', authLimiter, async (req, res, next) => {
  try {
    if (!mongoReady || process.env.ALLOW_ADMIN_SIGNUP !== 'true') return res.status(403).json({ message: 'Admin sign-up is disabled. Request the secure setup key from the business owner.' })
    const { setupKey, name, email, password } = z.object({ setupKey: z.string().min(12), name: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(12).max(200) }).parse(req.body)
    if (setupKey !== process.env.ADMIN_SIGNUP_KEY) return res.status(403).json({ message: 'The admin setup key is not valid.' })
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists.' })
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: 'admin' })
    return sendSession(res, user, 201)
  } catch (error) { next(error) }
})

app.get('/api/admin/overview', requireAuth, requireRole('admin', 'editor'), async (_req, res, next) => {
  try {
    if (mongoReady) {
      const [total, published, drafts, lowStock, customOrders, recent] = await Promise.all([
        Product.countDocuments(), Product.countDocuments({ status: 'published' }), Product.countDocuments({ status: 'draft' }), Product.countDocuments({ stock: { $lte: 5 } }),
        CustomOrder.countDocuments(), Product.find().sort({ updatedAt: -1 }).limit(5).lean()
      ])
      return res.json({ total, published, drafts, lowStock, customOrders, recent: recent.map(publicProduct) })
    }
    res.json({ total: localProducts.length, published: localProducts.filter(p => p.status === 'published').length, drafts: localProducts.filter(p => p.status === 'draft').length, lowStock: localProducts.filter(p => p.stock <= 5).length, customOrders: localOrders.length, recent: localProducts.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5).map(publicProduct) })
  } catch (error) { next(error) }
})

app.get('/api/admin/products', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const { search = '', category = 'all', status = 'all', sort = 'newest' } = req.query
    if (mongoReady) {
      const query = { ...(category !== 'all' ? { category } : {}), ...(status !== 'all' ? { status } : {}), ...(search ? { $text: { $search: search } } : {}) }
      const sortMap = { 'price-asc': { sellingPrice: 1 }, 'price-desc': { sellingPrice: -1 }, category: { category: 1 }, newest: { updatedAt: -1 } }
      return res.json((await Product.find(query).sort(sortMap[sort] || sortMap.newest).lean()).map(publicProduct))
    }
    let products = [...localProducts]
    if (category !== 'all') products = products.filter(p => p.category === category)
    if (status !== 'all') products = products.filter(p => p.status === status)
    if (search) { const needle = search.toLowerCase(); products = products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(needle)) }
    const sorts = { 'price-asc': (a, b) => a.sellingPrice - b.sellingPrice, 'price-desc': (a, b) => b.sellingPrice - a.sellingPrice, category: (a, b) => a.category.localeCompare(b.category), newest: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt) }
    res.json(products.sort(sorts[sort]).map(publicProduct))
  } catch (error) { next(error) }
})

const offerInput = z.object({
  title: z.string().trim().min(2).max(120), code: z.string().trim().min(3).max(40), description: z.string().trim().max(300).optional().default(''),
  type: z.enum(['percentage', 'flat', 'shipping']), value: z.coerce.number().min(0).max(100000), minimumOrder: z.coerce.number().min(0).max(1000000).default(0),
  status: z.enum(['active', 'draft', 'expired']), expiresAt: z.string().datetime().nullable().optional()
})

app.get('/api/admin/offers', requireAuth, requireRole('admin', 'editor'), async (_req, res, next) => {
  try { res.json((mongoReady ? await Offer.find().sort({ updatedAt: -1 }).lean() : localOffers).map(publicProduct)) } catch (error) { next(error) }
})

app.post('/api/admin/offers', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = offerInput.parse(req.body)
    if (mongoReady) return res.status(201).json(publicProduct(await Offer.create({ ...payload, code: payload.code.toUpperCase() })))
    if (localOffers.some(offer => offer.code === payload.code.toUpperCase())) return res.status(409).json({ message: 'That offer code already exists.' })
    const offer = { ...payload, code: payload.code.toUpperCase(), _id: `offer-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() }
    localOffers.unshift(offer); res.status(201).json(publicProduct(offer))
  } catch (error) { next(error) }
})

app.put('/api/admin/offers/:id', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = offerInput.parse(req.body)
    if (mongoReady) { const offer = await Offer.findByIdAndUpdate(req.params.id, { ...payload, code: payload.code.toUpperCase() }, { new: true, runValidators: true }); if (!offer) return res.status(404).json({ message: 'Offer not found.' }); return res.json(publicProduct(offer)) }
    const index = localOffers.findIndex(offer => offer._id === req.params.id); if (index < 0) return res.status(404).json({ message: 'Offer not found.' })
    localOffers[index] = { ...localOffers[index], ...payload, code: payload.code.toUpperCase(), updatedAt: new Date() }; res.json(publicProduct(localOffers[index]))
  } catch (error) { next(error) }
})

app.delete('/api/admin/offers/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (mongoReady) { const offer = await Offer.findByIdAndDelete(req.params.id); if (!offer) return res.status(404).json({ message: 'Offer not found.' }) }
    else { const before = localOffers.length; localOffers = localOffers.filter(offer => offer._id !== req.params.id); if (before === localOffers.length) return res.status(404).json({ message: 'Offer not found.' }) }
    res.status(204).end()
  } catch (error) { next(error) }
})

const announcementInput = z.object({
  message: z.string().trim().min(3).max(300),
  enabled: z.boolean().default(true),
  mode: z.enum(['scroll', 'static']).default('scroll'),
  scrollSpeed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  linkText: z.string().trim().max(60).default(''),
  linkUrl: z.string().trim().max(2048).default(''),
  openInNewTab: z.boolean().default(false),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priority: z.coerce.number().int().min(0).max(10000).default(0),
  displayOrder: z.coerce.number().int().min(0).max(10000).default(0)
}).superRefine((announcement, ctx) => {
  if (Boolean(announcement.linkText) !== Boolean(announcement.linkUrl)) ctx.addIssue({ code: 'custom', path: ['linkText'], message: 'Enter both promotional link text and destination, or leave both blank.' })
  if (announcement.linkUrl) {
    const validInternalPath = announcement.linkUrl.startsWith('/') && !announcement.linkUrl.startsWith('//')
    let validExternalUrl = false
    try { const url = new URL(announcement.linkUrl); validExternalUrl = ['http:', 'https:'].includes(url.protocol) } catch { /* internal paths are handled above */ }
    if (!validInternalPath && !validExternalUrl) ctx.addIssue({ code: 'custom', path: ['linkUrl'], message: 'Use a secure https URL or a site path beginning with /.' })
  }
  if (announcement.startsAt && announcement.endsAt && new Date(announcement.endsAt) < new Date(announcement.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End date must be after the start date.' })
})

app.get('/api/admin/announcements', requireAuth, requireRole('admin', 'editor'), async (_req, res, next) => {
  try { res.json(sortAnnouncements(mongoReady ? await Announcement.find().lean() : localAnnouncements).map(publicProduct)) } catch (error) { next(error) }
})

app.post('/api/admin/announcements', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = announcementInput.parse(req.body)
    if (mongoReady) return res.status(201).json(publicProduct(await Announcement.create(payload)))
    const announcement = { ...payload, _id: `announcement-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() }
    localAnnouncements.unshift(announcement)
    res.status(201).json(publicProduct(announcement))
  } catch (error) { next(error) }
})

app.put('/api/admin/announcements/:id', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = announcementInput.parse(req.body)
    if (mongoReady) {
      const announcement = await Announcement.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true })
      if (!announcement) return res.status(404).json({ message: 'Announcement not found.' })
      return res.json(publicProduct(announcement))
    }
    const index = localAnnouncements.findIndex(item => item._id === req.params.id)
    if (index < 0) return res.status(404).json({ message: 'Announcement not found.' })
    localAnnouncements[index] = { ...localAnnouncements[index], ...payload, updatedAt: new Date() }
    res.json(publicProduct(localAnnouncements[index]))
  } catch (error) { next(error) }
})

app.delete('/api/admin/announcements/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (mongoReady) {
      const announcement = await Announcement.findByIdAndDelete(req.params.id)
      if (!announcement) return res.status(404).json({ message: 'Announcement not found.' })
    } else {
      const before = localAnnouncements.length
      localAnnouncements = localAnnouncements.filter(item => item._id !== req.params.id)
      if (before === localAnnouncements.length) return res.status(404).json({ message: 'Announcement not found.' })
    }
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = productInput.parse(cleanProductBody(req.body))
    if (mongoReady) return res.status(201).json(publicProduct(await Product.create(payload)))
    if (localProducts.some(p => p.slug === payload.slug || p.sku === payload.sku)) return res.status(409).json({ message: 'Slug or SKU already exists.' })
    const created = { ...payload, _id: `demo-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() }
    localProducts.unshift(created)
    res.status(201).json(publicProduct(created))
  } catch (error) { next(error) }
})

app.put('/api/admin/products/:id', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const payload = productInput.parse(cleanProductBody(req.body))
    if (mongoReady) {
      const existing = await Product.findById(req.params.id)
      if (!existing) return res.status(404).json({ message: 'Product not found.' })
      const updated = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true })
      const retained = new Set(payload.images.map(image => image.publicId).filter(Boolean))
      void removeCloudinaryImages(existing.images.filter(image => image.publicId && !retained.has(image.publicId)))
      return res.json(publicProduct(updated))
    }
    const index = localProducts.findIndex(p => p._id === req.params.id)
    if (index < 0) return res.status(404).json({ message: 'Product not found.' })
    localProducts[index] = { ...localProducts[index], ...payload, updatedAt: new Date() }
    res.json(publicProduct(localProducts[index]))
  } catch (error) { next(error) }
})

app.delete('/api/admin/products/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (mongoReady) { const result = await Product.findByIdAndDelete(req.params.id); if (!result) return res.status(404).json({ message: 'Product not found.' }); void removeCloudinaryImages(result.images) }
    else { const before = localProducts.length; localProducts = localProducts.filter(p => p._id !== req.params.id); if (localProducts.length === before) return res.status(404).json({ message: 'Product not found.' }) }
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/admin/products/:id/duplicate', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const suffix = `copy-${Date.now().toString().slice(-5)}`
    if (mongoReady) {
      const product = await Product.findById(req.params.id).lean()
      if (!product) return res.status(404).json({ message: 'Product not found.' })
      delete product._id; delete product.createdAt; delete product.updatedAt
      const copyImages = (product.images || []).map(image => ({ ...image, publicId: undefined }))
      const copy = await Product.create({ ...product, images: copyImages, name: `${product.name} (Copy)`, slug: `${product.slug}-${suffix}`, sku: `${product.sku}-${suffix}`.toUpperCase(), status: 'draft', featured: false })
      return res.status(201).json(publicProduct(copy))
    }
    const product = localProducts.find(p => p._id === req.params.id)
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    const copy = { ...product, _id: `demo-${Date.now()}`, images: (product.images || []).map(image => ({ ...image, publicId: undefined })), name: `${product.name} (Copy)`, slug: `${product.slug}-${suffix}`, sku: `${product.sku}-${suffix}`.toUpperCase(), status: 'draft', featured: false, createdAt: new Date(), updatedAt: new Date() }
    localProducts.unshift(copy)
    res.status(201).json(publicProduct(copy))
  } catch (error) { next(error) }
})

app.patch('/api/admin/products/:id/status', requireAuth, requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['published', 'draft']) }).parse(req.body)
    if (mongoReady) { const product = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!product) return res.status(404).json({ message: 'Product not found.' }); return res.json(publicProduct(product)) }
    const product = localProducts.find(p => p._id === req.params.id)
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    product.status = status; product.updatedAt = new Date(); res.json(publicProduct(product))
  } catch (error) { next(error) }
})

app.post('/api/admin/uploads', requireAuth, requireRole('admin', 'editor'), uploadLimiter, upload.array('images', 8), async (req, res, next) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: 'Cloudinary is not configured. Add Cloudinary environment variables to enable uploads.' })
    if (!req.files?.length) return res.status(400).json({ message: 'Upload JPEG, PNG, WebP, or AVIF images no larger than 5 MB.' })
    const detectedTypes = await Promise.all(req.files.map(file => fileTypeFromBuffer(file.buffer)))
    if (detectedTypes.some((type, index) => !type || !allowedImageTypes.has(type.mime) || type.mime !== req.files[index].mimetype)) return res.status(400).json({ message: 'One or more uploads are not valid image files.' })
    const results = await Promise.all(req.files.map((file, index) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'da-dino-clothing-products', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'], use_filename: false, unique_filename: true, overwrite: false, transformation: [{ width: 1800, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }] }, (error, result) => error ? reject(error) : resolve({ url: result.secure_url, publicId: result.public_id, alt: `Product image ${index + 1}`, isPrimary: false }))
      streamifier.createReadStream(file.buffer).pipe(stream)
    })))
    res.status(201).json(results)
  } catch (error) { next(error) }
})

app.all('/api/{*splat}', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }))
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')))

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin not allowed by CORS.') return res.status(403).json({ message: 'Request origin is not allowed.' })
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Please check the form fields.', errors: z.flattenError(error).fieldErrors })
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or less.' : error.message })
  if (error?.code === 11000) return res.status(409).json({ message: 'That slug or SKU is already in use.' })
  console.error(error)
  res.status(500).json({ message: 'Something went wrong. Please try again.' })
})

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    if (isProduction) throw new Error('MONGODB_URI must be configured in production.')
    return console.warn('Running with temporary demo catalog. Configure MONGODB_URI for persistent MongoDB storage.')
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10)
    })
    mongoReady = true
    if (process.env.SEED_SAMPLE_PRODUCTS === 'true' && await Product.countDocuments() === 0) await Product.insertMany(sampleProducts)
    console.log('Connected to MongoDB')
  } catch (error) {
    if (isProduction) throw new Error(`MongoDB Atlas connection failed: ${error.message}`)
    console.error('MongoDB unavailable; using temporary demo catalog.', error.message)
  }
}

export { app, connectDatabase }

if (process.env.NODE_ENV !== 'test') {
  try {
    await connectDatabase()
    app.listen(port, () => console.log(`DA_DINO_clothing API listening on :${port}`))
  } catch (error) {
    console.error('Server startup failed:', error.message)
    process.exitCode = 1
  }
}
