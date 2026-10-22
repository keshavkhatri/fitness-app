# stokeform.com

The StokeForm website: a home page, Terms, Privacy Policy and Contact page. Plain HTML and one CSS file: no framework, no build step, no scripts, no cookies and no external requests (the Inter font is served from `assets/fonts`).

```
website/
  index.html  terms.html  privacy.html  contact.html  delete-account.html  404.html
  assets/css/site.css       the one stylesheet (dark by default, light if the visitor's system is light)
  assets/img/               icons and the social preview image (generated, see below)
  assets/fonts/             Inter (SIL Open Font License, included)
  robots.txt  sitemap.xml
  vercel.json               clean URLs, www to apex redirect, security headers
```

## Deploy on Vercel

1. In Vercel, **Add New > Project** and import this repository.
2. Set **Root Directory** to `website`. Framework Preset: **Other**. Leave Build Command and Output Directory empty (static files are served as they are).
3. **Settings > Domains**: add `stokeform.com` (primary, serving the Production deployment) and `www.stokeform.com` (redirecting to `stokeform.com`; `vercel.json` also does this). Follow Vercel's DNS instructions at the domain registrar.
   **Do not redirect `stokeform.com` to `www.stokeform.com`** in the dashboard: together with the rule in `vercel.json` that is a redirect loop (`ERR_TOO_MANY_REDIRECTS`). Vercel sets the apex-to-www redirect by default when `www` is added first, so check it.
4. Every push to the production branch redeploys. Pull requests get preview URLs.

Pages are served without `.html` (`/terms`, `/privacy`, `/contact`). A `Content-Security-Policy` allows only same-origin images, styles and fonts, so **do not add inline `<script>` or `style=""`**: put styles in `site.css`.

## Preview locally

```
npx serve website            # then open http://localhost:3000  (clean URLs: /terms)
```

## Things to check before going public

- **Contact address.** Every page uses `support@stokeform.com`. Create that mailbox (or change it in the four pages) before launch.
- **Who "we" are.** Done (22 Oct 2026): Keshav Khatri, an individual based in India. Indian law governs the terms (`terms.html`, section 15), and the privacy policy names him as data fiduciary and Grievance Officer. If a company takes over the app, change all three.
- **Legal review.** The texts describe how the app works today. Have them reviewed before launch, and update them (and the date) whenever the app starts collecting something new, for example backup or sync of fitness data.
- **Facts that must stay true:**
  - Fitness data is encrypted on the phone and uploaded only with the opt-in cloud backup (encrypted on the server; turning it off deletes it).
  - The server checks that backed-up profiles are 18+.
  - Push notifications go through Firebase Cloud Messaging.
  - Crash and error reports go to Sentry, without personal data.
  - The server runs on Google Cloud in europe-west1, the database is Neon, email is sent through Resend, InBody reports are read through OpenAI, and sign-in uses Google.
  - Account deletion is in the app, and `delete-account.html` describes it (Google Play links to that page).

  If any of these change, change `privacy.html` (and its date).

## Google sign-in (OAuth consent screen)

In Google Cloud console, **Google Auth Platform > Branding** for the project that owns the OAuth client:

| Field | Value |
| --- | --- |
| App name | `StokeForm` |
| Application home page | `https://stokeform.com` |
| Privacy policy link | `https://stokeform.com/privacy` |
| Terms of service link | `https://stokeform.com/terms` |
| Authorised domain | `stokeform.com` (verify it in Google Search Console first) |
| Support and developer contact emails | `support@stokeform.com` or your own |

## Images

`assets/img/*` are generated from the app artwork in `scripts/brand-source/` by `npm run brand:assets` (the same command that writes the Android icons). Re-run it after changing the artwork.
