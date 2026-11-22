# Deploy DA_DINO_clothing: Vercel frontend + Render API

This repository is designed to deploy as two services. The shop UI goes to Vercel; the secure Express API goes to Render. Do not put database, JWT, or Cloudinary secrets in Vercel's `VITE_*` variables.

## Environment separation

- Local development: copy `.env.example` to `.env` and keep `NODE_ENV=development`.
- Render production: set `NODE_ENV=production`. Do not use a local MongoDB URI or demo fallback.
- Vercel frontend: set only public `VITE_*` values. Never add `MONGODB_URI`, `JWT_SECRET`, or Cloudinary secret values.

## 1. Create the database and image storage

1. Create a MongoDB Atlas database and a restricted database user.
2. In Atlas Network Access, allow Render's connection (for initial development, use a temporary broad rule only if you understand the risk, then restrict it).
3. Create a Cloudinary product account. Keep the cloud name, API key and API secret ready.

## 2. Deploy the backend to Render

1. Push this project to a GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository, and accept `render.yaml`.
3. Set the following service environment variables in Render:
   - `MONGODB_URI`: the Atlas connection string
   - `CLIENT_ORIGIN`: initially your Vercel URL; add any custom domain later, comma-separated if there are several
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `MONGODB_SERVER_SELECTION_TIMEOUT_MS=10000`
   - `MONGODB_MAX_POOL_SIZE=10`
   - `ADMIN_SETUP_KEY`: a long, unique secret
   - `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true` are included by the Blueprint for a Vercel + Render split deployment.
4. Temporarily set `ALLOW_ADMIN_SETUP=true`, deploy, then create the first admin with `POST /api/auth/setup` and the setup key. Alternatively, enable `ALLOW_ADMIN_SIGNUP=true` and set a distinct `ADMIN_SIGNUP_KEY`, then use `/admin/signup`. Immediately set the enabled flag back to `false` and redeploy.
5. Confirm `https://<render-service>.onrender.com/api/health` returns `ok: true`.

The API uses the in-memory demo catalogue only for local development when `MONGODB_URI` is missing. Production startup fails closed if `MONGODB_URI` is missing or Atlas cannot be reached. This prevents a live store from silently showing demo data. To populate the initial catalogue in MongoDB, run `npm run seed` locally with the Atlas URI in `.env`; this operation is optional.

## 3. Deploy the frontend to Vercel

1. In Vercel, choose **Add New → Project**, import the same Git repository and accept the Vite defaults.
2. Add this production environment variable before deploying:

   ```
   VITE_API_URL=https://<render-service>.onrender.com/api
   ```

3. Deploy. Copy the resulting `https://<project>.vercel.app` URL into Render's `CLIENT_ORIGIN` (no trailing slash) and redeploy the Render service. If you use a custom API domain rather than `*.onrender.com`, update Vercel's `Content-Security-Policy` `connect-src` in `vercel.json` to include that exact HTTPS API origin.
4. Open the Vercel URL and verify the catalogue loads. Test admin sign-in, a product change, and a Cloudinary upload.

## Cloudinary folders

- Product uploads are stored in `da-dino-clothing-products`.
- Customer custom-design uploads are stored in `da-dino-clothing-custom-orders`.
- MongoDB stores the returned Cloudinary `secure_url` and `public_id`.
- Replacing/removing product images deletes removed public IDs.
- Deleting a custom order through the admin API deletes its reference image public ID.

## Optional Razorpay setup

No live Razorpay keys are stored in this repository. If paid checkout is enabled later, add these values only to Render:

```
RAZORPAY_KEY_ID=<your Razorpay key id>
RAZORPAY_KEY_SECRET=<your Razorpay key secret>
RAZORPAY_WEBHOOK_SECRET=<your Razorpay webhook secret>
```

Never put the secret or webhook secret in `VITE_*` variables or Vercel. Add server-verified order creation and webhook verification before enabling paid checkout.

## Important security notes

- Never expose `MONGODB_URI`, `JWT_SECRET`, Cloudinary secrets, or `ADMIN_SETUP_KEY` to Vercel or to client code.
- Keep `ALLOW_ADMIN_SETUP=false` after the initial account is created.
- Keep `ALLOW_ADMIN_SIGNUP=false` except when onboarding a specific trusted administrator. Never put either admin setup key in Vercel variables or the frontend.
- Use a long random `JWT_SECRET`; Render can generate one from the Blueprint.
- Authentication is an HttpOnly, Secure session cookie rather than a browser-readable token. The API verifies an allowed `Origin` for production state-changing requests to defend against CSRF. If browser privacy settings block third-party cookies between `vercel.app` and `onrender.com`, use `shop.yourdomain.com` and `api.yourdomain.com` and change `COOKIE_SAME_SITE` to `lax`.
- Cloudinary uploads are accepted only through authenticated editor/admin API routes and restricted to JPEG, PNG, WebP and AVIF up to 5 MB.
