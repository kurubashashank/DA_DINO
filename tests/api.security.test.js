import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../server/index.js'
import { issueToken, rememberLocalUser } from '../server/auth.js'

const customer = {
  name: 'Security Test Customer',
  email: `security-test-${Date.now()}@example.com`,
  password: 'correct-horse-battery-staple',
  phone: '9000000000'
}

describe('API security controls', () => {
  it('returns a deployment health status without exposing secrets', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({ ok: expect.any(Boolean), uptimeSeconds: expect.any(Number) }))
    expect(JSON.stringify(response.body)).not.toMatch(/mongodb\+srv|api_secret|jwt/i)
  })

  it('returns only JSON for unknown API routes', async () => {
    const response = await request(app).get('/api/not-a-real-route')
    expect(response.status).toBe(404)
    expect(response.body.message).toBe('API endpoint not found.')
  })

  it('rejects unauthenticated admin access even when a bearer header is supplied', async () => {
    const response = await request(app)
      .get('/api/admin/products')
      .set('Authorization', 'Bearer deliberately-not-used')
    expect(response.status).toBe(401)
    expect(response.body.message).toBe('Authentication required.')
  })

  it('uses an HttpOnly session cookie and never returns a token or password hash', async () => {
    const agent = request.agent(app)
    const response = await agent.post('/api/customers/register').send(customer)
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ user: expect.objectContaining({ email: customer.email, role: 'customer' }) })
    expect(JSON.stringify(response.body)).not.toMatch(/token|password/i)
    expect(response.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i)

    const profile = await agent.get('/api/customers/me')
    expect(profile.status).toBe(200)
    expect(profile.body.user.email).toBe(customer.email)

    const adminRoute = await agent.get('/api/admin/overview')
    expect(adminRoute.status).toBe(403)
  })

  it('invalidates the server session on logout', async () => {
    const agent = request.agent(app)
    const registration = await agent.post('/api/customers/register').send({ ...customer, email: `logout-${Date.now()}@example.com` })
    expect(registration.status).toBe(201)
    expect((await agent.post('/api/auth/logout')).status).toBe(204)
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('stores cart and wishlist data behind customer authentication with canonical product values', async () => {
    const agent = request.agent(app)
    const registration = await agent.post('/api/customers/register').send({ ...customer, email: `commerce-${Date.now()}@example.com` })
    expect(registration.status).toBe(201)
    const product = (await agent.get('/api/products')).body[0]

    const added = await agent.post('/api/customers/cart').send({ productId: product.id, size: product.sizes[0], color: product.colors[0], quantity: 1, price: 1 })
    expect(added.status).toBe(201)
    expect(added.body.items[0]).toEqual(expect.objectContaining({ id: product.id, price: product.sellingPrice, quantity: 1 }))

    const overStock = await agent.put('/api/customers/cart').send({ productId: product.id, size: product.sizes[0], color: product.colors[0], quantity: product.stock + 1 })
    expect(overStock.status).toBe(400)

    const wished = await agent.post('/api/customers/wishlist').send({ productId: product.id })
    expect(wished.status).toBe(200)
    expect(wished.body.productIds).toContain(product.id)

    const removed = await agent.delete('/api/customers/cart').send({ productId: product.id, size: product.sizes[0], color: product.colors[0] })
    expect(removed.status).toBe(200)
    expect(removed.body.items).toEqual([])
  })

  it('returns validation errors instead of accepting malformed public input', async () => {
    const response = await request(app).post('/api/custom-orders').send({})
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Please check the form fields.')
  })

  it('creates a custom-order request with optional Cloudinary design metadata', async () => {
    const response = await request(app).post('/api/custom-orders').send({
      productType: 'Custom T-shirt',
      quantity: 12,
      size: 'XL',
      details: 'Print a small dinosaur emblem on the back.',
      customerName: 'Design Customer',
      email: 'design@example.com',
      phone: '9000000001',
      referenceUrl: 'https://res.cloudinary.com/demo/image/upload/design.jpg',
      referencePublicId: 'da-dino-clothing-custom-orders/design-123'
    })
    expect(response.status).toBe(201)
    expect(response.body.message).toContain('Request received')
  })

  it('rejects a request from an untrusted browser origin', async () => {
    const response = await request(app).get('/api/products').set('Origin', 'https://attacker.invalid')
    expect(response.status).toBe(403)
    expect(response.body.message).toBe('Request origin is not allowed.')
  })

  it('protects the upload route before accepting files', async () => {
    const response = await request(app)
      .post('/api/admin/uploads')
      .attach('images', Buffer.from('not an image'), { filename: 'test.jpg', contentType: 'image/jpeg' })
    expect(response.status).toBe(401)
  })

  it('rejects invalid custom-design files before Cloudinary upload', async () => {
    const response = await request(app)
      .post('/api/custom-orders/reference-image')
      .attach('image', Buffer.from('not an image'), { filename: 'design.txt', contentType: 'text/plain' })
    expect(response.status).toBe(400)
  })

  it('returns only currently enabled announcements to the public storefront', async () => {
    const response = await request(app).get('/api/announcements')
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({
      enabled: true,
      message: expect.stringContaining('WELCOME10'),
      mode: 'scroll',
      scrollSpeed: 'normal',
      linkText: 'Shop now',
      linkUrl: '/shop'
    })]))
  })

  it('keeps announcement management routes protected', async () => {
    const response = await request(app).get('/api/admin/announcements')
    expect(response.status).toBe(401)
  })

  it('allows an administrator to publish, update, disable and remove an announcement', async () => {
    const admin = rememberLocalUser({ _id: 'local-announcement-admin', name: 'Announcement Admin', email: 'announcements@example.com', role: 'admin', tokenVersion: 0 })
    const cookie = `da_dino_session=${issueToken(admin)}`
    const newAnnouncement = {
      message: 'Test announcement for a seasonal collection.', enabled: true, mode: 'scroll', scrollSpeed: 'fast',
      linkText: 'View collection', linkUrl: '/collections/ready-made-t-shirts', openInNewTab: false,
      startsAt: null, endsAt: null, priority: 999, displayOrder: 1
    }
    const created = await request(app).post('/api/admin/announcements').set('Cookie', cookie).send(newAnnouncement)
    expect(created.status).toBe(201)
    expect(created.body).toEqual(expect.objectContaining({ id: expect.any(String), ...newAnnouncement }))

    const publicAfterCreate = await request(app).get('/api/announcements')
    expect(publicAfterCreate.body[0]).toEqual(expect.objectContaining({ id: created.body.id, scrollSpeed: 'fast' }))

    const updated = await request(app).put(`/api/admin/announcements/${created.body.id}`).set('Cookie', cookie).send({ ...newAnnouncement, mode: 'static', scrollSpeed: 'slow' })
    expect(updated.status).toBe(200)
    expect(updated.body).toEqual(expect.objectContaining({ mode: 'static', scrollSpeed: 'slow' }))

    const disabled = await request(app).put(`/api/admin/announcements/${created.body.id}`).set('Cookie', cookie).send({ ...newAnnouncement, enabled: false, mode: 'static', scrollSpeed: 'slow' })
    expect(disabled.status).toBe(200)
    expect((await request(app).get('/api/announcements')).body.map(item => item.id)).not.toContain(created.body.id)

    expect((await request(app).delete(`/api/admin/announcements/${created.body.id}`).set('Cookie', cookie)).status).toBe(204)
  })
})
