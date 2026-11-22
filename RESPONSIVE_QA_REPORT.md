# DA_DINO_clothing: animation, announcement and responsive QA report

Reviewed on 21 November 2026 against the local application at `127.0.0.1`. Browser checks used Chromium through Playwright emulation only. No physical devices, Safari, Firefox, Edge, payment provider, deployed Vercel site, Render service, MongoDB Atlas instance, or Cloudinary account were tested.

## 1. Intro animation implementation

- Added a full-screen, cinematic DA_DINO opening sequence using the existing transparent DA_DINO logo asset. It enters from the left, has a controlled walk cadence, centre-stage roar/impact moment, logo reveal, and transition out.
- It has no autoplay sound.
- It includes a keyboard-focusable **Skip intro** button and continues directly if the asset errors.
- It respects `prefers-reduced-motion` by immediately yielding to the site.
- Playback is configurable with `VITE_INTRO_PLAYBACK`: `first-visit` (default), `session`, `always`, or `disabled`. First-visit/session state is persisted in browser storage; route navigation does not replay the intro.
- The provided logo is a single raster asset, rather than a separated-body-part mascot. The motion is therefore carefully choreographed image movement, scale and particles, not true articulated leg/mouth animation. A supplied Rive/Lottie/SVG mascot would be required for character-grade limb animation.

## 2. Announcement bar and admin controls

- Added MongoDB `Announcement` records plus public and role-protected admin REST APIs.
- Public display only returns enabled, in-schedule announcements, ordered by priority then display order.
- The admin workspace supports enable/disable, text, scroll/static mode, slow/normal/fast speed, optional validated destination/link label, new-tab option, start/end dates, priority, display order, preview, create, edit and delete.
- Static messages rotate when more than one is active. Scrolling messages use a duplicated track for a seamless loop. Reduced-motion users receive non-moving content.

## 3. Responsive device-emulation results

The homepage was checked for horizontal overflow at: **320, 360, 375, 390, 393, 414, 430, 480, 768, 820, 1024, 1280, 1366, 1440 and 1920 px**.

Public, category, product, custom-order, cart, wishlist, account, checkout, admin login and admin-signup routes were checked at **320, 768 and 1440 px**. The mobile navigation drawer was checked at **390 × 844 px**. No horizontal page overflow or uncaught JavaScript exceptions were found in these executed Chromium checks.

## 4. Browser compatibility

- Chromium / Playwright: tested and passed.
- Microsoft Edge: not separately tested; Chromium rendering is a useful approximation, not a substitute.
- Firefox and Safari: not tested in this environment.
- Physical mobile browsers: not tested.

## 5. Functional test results

- Intro appears, can be skipped, does not replay on SPA navigation, and honours reduced motion.
- Announcement bar works in scrolling and static modes.
- Mobile drawer opens and closes correctly.
- Brand asset and public product images load in the final Chromium run.
- Customer-session, cart, wishlist, admin authorization, upload protection, custom-order validation and announcement CRUD APIs are covered by the server suite.
- Payment flows were not exercised because payments/orders remain intentionally unimplemented; checkout clearly states that it does not create a payment or order.

## 6. Accessibility findings

- Added a labelled announcement region, screen-reader fallback for scrolling content, descriptive announcement links, reduced-motion handling, a labelled modal intro, focused skip control, and a labelled mobile-nav dialog.
- Keyboard focus is available for the intro skip action and drawer close action.
- A full screen-reader audit and automated WCAG colour-contrast scan were not run. Those remain recommended before production launch.

## 7. Performance findings

- No heavyweight motion package was added. The intro is CSS and the existing logo asset.
- Final production bundle: **402.55 kB JavaScript / 125.71 kB gzip**, **52.23 kB CSS / 11.66 kB gzip**.
- The intro is skippable, first-visit-only by default, and motion-reduced when requested.
- Catalog and editorial imagery still use remote Unsplash URLs. For production consistency and performance, migrate approved production product imagery to Cloudinary through the admin uploader.

## 8–9. Issues discovered and fixed

| Severity | Component / viewport | Root cause | Fix | Verification |
| --- | --- | --- | --- | --- |
| Medium | Custom tee product and category image | One referenced Unsplash image returned no rendered image in Chromium. | Replaced it with a working fashion image URL. | Final browser image check passed. |
| Test infrastructure | Full responsive sweep | The intentionally strict API rate limiter was reached during dozens of automated route loads. | Bypass is limited to the dedicated `PLAYWRIGHT_TEST=true` process; normal development/production rate limits are unchanged. | Full browser suite completed. |
| Test infrastructure | `npm test` | Vitest attempted to load Playwright specs. | Excluded `tests/browser/**` from Vitest. | Unit/API suite now passes independently. |
| Test reliability | Announcement and drawer assertions | Generic accessible names matched multiple valid controls. | Scoped selectors to the announcement region and mobile dialog. | Browser assertions pass. |

## 10. Remaining issues / recommended next work

1. Add an animation-ready mascot (Rive/Lottie or separated SVG) for fully articulated dinosaur movement.
2. Add payment provider, server-verified order creation, webhook verification and payment success/failure pages before accepting money.
3. Test deployed Vercel/Render/Atlas/Cloudinary integrations after credentials and domains are configured.
4. Run Firefox, Safari and physical-device testing plus automated axe/contrast checks before launch.
5. Replace remote demo photography with owned Cloudinary assets.

## 11. Automated tests executed

| Suite | Executed | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Vitest API/security | 11 | 11 | 0 | 0 |
| Playwright Chromium browser emulation | 7 | 7 | 0 | 0 |
| **Total test cases** | **18** | **18** | **0** | **0** |

Additional checks:

- `npm run build`: passed.
- `npm audit --omit=dev`: 0 vulnerabilities.

## 12. Production readiness assessment

The implemented animation, announcement management, responsive safeguards and test automation are production-ready once the documented Render/MongoDB/Cloudinary/Vercel environment is configured. Do not represent the site as able to accept paid orders until payment/order work listed above is complete.
