# DA_DINO_clothing security review

Reviewed locally on 20 November 2026. Scope: the Vite storefront, Express API, MongoDB models, Cloudinary upload path, and Vercel/Render deployment files. All active testing was limited to the local application; no external systems were scanned or attacked.

## Executive result

The highest-risk implementation issues found during the review have been remediated and covered by an automated local API test suite. The application now uses short-lived HttpOnly session cookies instead of browser-readable bearer tokens; admin and editor routes enforce roles; incoming product/custom-order data is validated; and the upload route checks both claimed MIME type and file signatures before Cloudinary receives an image.

`npm audit --omit=dev` completed with **0 known production dependency vulnerabilities** after upgrading `zod` and `file-type`.

## Remediated findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Admin read routes were authenticated but did not consistently require an admin/editor role. | Added role middleware to all dashboard/product/offer APIs. |
| High | Browser-readable tokens were stored in local storage. | Replaced with 2-hour HttpOnly, Secure production session cookies. Logout increments a per-user token version, invalidating an old cookie server-side. |
| High | Uploaded files relied on client-provided MIME metadata. | Enforced 5 MB/8-file limits, accepted image allow-list only, and verifies file magic bytes with patched `file-type` before the Cloudinary stream opens. |
| Medium | State-changing cookie-authenticated requests lacked a broad origin policy. | Production now accepts writes only from exact configured `CLIENT_ORIGIN` values; CORS is allow-list based and credentialed. |
| Medium | API routes could fall through to the SPA HTML response. | Added a JSON 404 handler for every unknown `/api/*` route. |
| Medium | No general API or upload abuse control. | Added global, authentication, custom-order, and upload rate limits. |
| Medium | Cart and wishlist values were browser-local, so a client-controlled price could be treated as meaningful later. | Added authenticated server-side cart/wishlist APIs. The server resolves product price, stock and variants; the client sends only product/variant/quantity intent. |
| Medium | Production could start without explicit client origin / TLS cookie settings. | Production startup requires `CLIENT_ORIGIN`; Render configuration sets `NODE_ENV=production`, Secure cookies, and a generated JWT secret. |
| Medium | Removed Cloudinary product images could remain orphaned. | Product update/delete schedules cleanup only for approved product-folder public IDs. |
| Dependency | `zod` and `file-type` advisories were present. | Updated to `zod 4.6.7` and `file-type 21.3.4`; audit now reports zero production vulnerabilities. |

## Controls verified locally

The `tests/api.security.test.js` suite verifies: unknown API JSON 404s, unauthenticated admin rejection even with a fake bearer header, HttpOnly customer sessions without token/hash response leakage, role separation, server-side logout invalidation, cart/wishlist authorization and canonical server-side pricing/stock, invalid public form rejection, untrusted-origin rejection, and upload authentication.

## Remaining deployment and product considerations

- Configure MongoDB Atlas backups, restricted database users, and network access in the provider consoles. These are deployment-account settings and cannot be validated from the local repository.
- Use HTTPS custom domains such as `shop.example.com` and `api.example.com` for the strongest browser-cookie reliability. Vercel plus Render on unrelated domains may be subject to browser third-party-cookie blocking; deployment instructions cover the required cookie setting and fallback.
- Payments and order fulfilment are intentionally not implemented. The current checkout explicitly creates no payment or order. Before accepting money, integrate a PCI-compliant payment provider, calculate totals/stock only on the server, use payment webhooks with signature verification and idempotency, and create orders only after verified payment.
- Add password-reset/email-verification delivery through a trusted transactional-email service before a public launch. Do not reveal whether an email account exists in that flow.
- Review Vercel/Render/Cloudinary/Atlas access logs and alerts after deployment. Application rate limits reduce abuse but do not replace provider-level DDoS, monitoring, or backup controls.

## Secure operator checklist

1. Set `MONGODB_URI`, Cloudinary credentials, the exact `CLIENT_ORIGIN`, and a strong generated `JWT_SECRET` only in Render.
2. Keep `ALLOW_ADMIN_SETUP=false` and `ALLOW_ADMIN_SIGNUP=false`, except during the short, supervised first-admin setup window.
3. Never define secrets with `VITE_` prefixes or commit a real `.env` file.
4. Run `npm audit --omit=dev`, `npm test`, and `npm run build` before each production release.
