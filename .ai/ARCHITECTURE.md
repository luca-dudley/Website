# The Vault Web Architecture Specification

> **Platform Architecture & Stack Constraints**  
> *Target Environment: Cloudflare Pages | Branch: `main` (Production) / `v3-dev` (Development)*

---

## 1. Hosting & Deployment: Cloudflare Pages

- **Deployment Model**: Zero-build static hosting deployed directly from the git repository.
- **Entry Points**: All primary user routes exist as root-level HTML documents (`index.html`, `vault.html`, `module.html`, `records.html`, `risk-assessments.html`, `sop.html`, `partner-portal.html`, `invite.html`, `support.html`, `systems.html`, `404.html`).
- **Zero Client Bundler**: No Node.js runtime, no Vite, no Webpack, and no build compilation step (`npm run build` is strictly prohibited). Cloudflare Pages serves static files directly from the repository root.
- **Custom Domains & CDN**: Deployed to `www.simpleza.co.za` via Cloudflare's global edge network with automatic SSL/TLS termination and HTTP/2 + HTTP/3 multiplexing.

---

## 2. Frontend Conventions: Vanilla HTML5, ES6 & Tailwind CDN

- **Markup & Layout**: Semantic HTML5 with modular responsive grid structures.
- **JavaScript Architecture**:
  - Native ECMAScript 6+ modules and scripts located in `js/` (e.g., `js/main.js` for navigation/layout controls, `js/profile-engine.js` for session management and modal injection) and specialized modular helpers in `js/modules/`.
  - Dynamically injected component templates (e.g., `profile-modal.html`) asynchronously fetched and inserted into the active DOM by `js/profile-engine.js`.
  - Zero heavy frontend framework dependencies (strictly no React, Vue, Angular, or Svelte).
- **Styling Architecture**:
  - Official Tailwind CSS script via CDN (`https://cdn.tailwindcss.com`).
  - Standardized palette extension configured on all views:
    ```javascript
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#1e3a5f',    // Deep Navy Brand Primary
            foreground: '#0f172a', // Slate 900
            muted: '#64748b'       // Slate 500
          }
        }
      }
    }
    ```
- **Asset Directory Structure**:
  - `assets/branding/`: Master branding marks, transparent icons, and official logos (`Simple_Logo.jpg`, `Simple_Logo-removebg-preview.png`, `Simple_Logo-White.png`).
  - `assets/logos/`: Corporate estate partner marks (e.g. Elliott Farms, Doveton Farms, Outlook Farms).
  - `assets/workflow_pics/`: Operations and workflow diagrams for PM, Procurement, and Construction suites.

---

## 3. Backend Architecture: Supabase

- **Supabase Host**: `https://ujhfkvoaaebdntuheyqo.supabase.co`
- **Authentication**: Supabase GoTrue Auth handling Email/Password login, password resets, and Google OAuth (`linkIdentity` and `signInWithOAuth`).
- **Multi-Tenant PostgreSQL**:
  - Tenant isolation strictly keyed on **`company_id`** (UUID foreign key referencing `companies.id`).
  - Strict Row Level Security (RLS) policies on all tables ensuring tenant users cannot view or mutate cross-company rows.
  - Multi-tenant catalog partitioning: global catalog rows use `company_id IS NULL`; private estate branded libraries use a tenant-specific `company_id`.
  - `SECURITY DEFINER` stored procedures for elevated multi-profile administration and billing reconciliation (e.g., `claim_additional_grower_subsidy`, `remove_team_member`, `provision_company_subscription`).
  - `service_role` security barrier: `purchase_crop_pack_addon` is locked down to service role execution only, callable solely via edge function webhooks.
- **Storage**: Supabase Storage bucket `avatars` with per-user path scoping (`${userId}/avatar.${ext}`).
- **Edge Functions (Deno Runtime)**:
  - `supabase/functions/paystack-webhook`: Validates HMAC SHA512 signatures, captures recurring subscriptions, invokes `purchase_crop_pack_addon`, and drains cancellation queues.
  - `supabase/functions/notify-referral-lead`: Sanitizes commercial processor referrals and delivers alerts via Resend API.
  - `supabase/functions/notify-support-ticket`: Dispatches operational helpdesk tickets to support teams via Resend API.
  - `supabase/functions/partner-monthly-digest`: Cron-triggered batch generation of 35-day encrypted tokens and dispatch of supply chain audit digests to corporate partner contacts.

---

## 4. Third-Party Integrations

1. **Paystack Inline v2**: Client-side checkout modal (`pk_live_6e9ead28ba957dc643c949c5dc8164e3d62c0d09`) managing Basic, Essential, Retail Enterprise, Subsidized Enterprise, and Crop Pack bolt-on subscriptions.
2. **Vimeo Player SDK**: Low-bandwidth video streaming with throttled watch-progress synchronization to `user_video_progress` and auto-completion thresholds at $\ge 90\%$.
3. **Resend Transactional Email**: Server-to-server transactional notification delivery with HTML sanitization.
4. **jsPDF**: Client-side statutory landscape and portrait PDF certificate generation under South African OHSA compliance guidelines.
