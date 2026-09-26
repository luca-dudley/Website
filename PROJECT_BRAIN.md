# The Vault Web — Master Project Brain

> **Production Architectural Specification & System Documentation**  
> *Last Verified: September 2026 | Deployment Environment: Cloudflare Pages (Production `main`)*

---

## 1. System Overview & Architecture

### Core Purpose
**The Vault** (`the-vault-web`) is a mission-critical, enterprise agricultural safety, occupational compliance, and operational workforce training platform developed for South African farming enterprises, packhouses, agricultural processors, and exporting syndicates.

The platform directly addresses statutory compliance with the **Occupational Health and Safety Act (OHSA)**, agricultural audit frameworks (GlobalG.A.P., SIZA, BRCGS, Fairtrade), and data governance mandates under the **Protection of Personal Information Act (POPIA)** and **GDPR**.

Key capabilities include:
- **Multilingual Video Training LMS**: Mobile-optimized, low-bandwidth video training delivered in English and isiZulu, covering general farm safety, machinery & workshops, pumping/irrigation, fleet safety, and specialized crop processing operations.
- **Statutory Risk Assessment Registers**: Baseline Risk Assessments (BRAs) and task-specific risk matrices with annual statutory review scheduling, Section 16(2) appointee signing workflows, and automated A4 landscape PDF generation.
- **Auditable Employee Training Logs**: Digital supervisor-and-worker dual-signature sign-off kiosks for single and group induction batches with tamper-resistant audit trails.
- **Crop-Pack Stacking & Co-Branded Portals**: Multi-tier crop content architecture enabling corporate processors (e.g., Macadamia and Banana handlers) to sponsor grower subscriptions and track supply chain audit compliance in real time via zero-login encrypted portals.
- **Standard Operating Procedures (SOPs)**: Centralized library of statutory and operational SOP documentation linked directly to training modules with corporate partner document overrides.

### Hosting & Infrastructure
- **Hosting Platform**: **Cloudflare Pages**
- **Production Branch**: `main`
- **DNS / Domain**: `www.simpleza.co.za` (Simple Solutions Safety & Operations)
- **Content Delivery Network**: Global Cloudflare Edge CDN with zero-latency caching for static HTML/JS/CSS assets and pre-rendered vector brand assets.

### Deployment Model
- **Zero-Build Static Architecture**: Cloudflare Pages serves files directly from the repository root. There is **strictly no client-side Node.js compilation**, no bundler (no Vite, Webpack, Parcel, or Rollup), and no build command (`npm run build` is not used).
- **Continuous Deployment**: Commits pushed directly to the `main` branch trigger automated atomic deployments on Cloudflare Pages.
- **Edge Compute**: Supabase Deno runtime hosts backend edge functions (`/supabase/functions/`) deployed directly to Supabase global infrastructure.

---

## 2. Frontend Conventions

### Tech Stack
- **Markup**: Semantic Vanilla HTML5.
- **Scripts**: Native ECMAScript 6+ modules (`/js/main.js`, `/js/profile-engine.js`, and inline scoped DOM controllers).
- **Styling**: Tailwind CSS delivered via official CDN script (`https://cdn.tailwindcss.com`) with custom brand configurations.
- **No Client Frameworks**: Strictly **no React, no Vue, no Svelte, and no Angular**. All dynamic DOM manipulation uses native browser APIs (`document.querySelector`, `addEventListener`, template literals, and Canvas 2D contexts).

### Tailwind Theme & Palette Configuration
Every page includes the standardized Tailwind theme extension:
```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#1e3a5f',    // Deep Navy (Brand Primary)
        foreground: '#0f172a', // Slate 900
        muted: '#64748b'       // Slate 500
      }
    }
  }
}
```

### Script Loading Rules & Execution Order
1. **Head Loading Order**:
   - Google Tag Manager (`gtag.js` with automated localhost suppression and `disable_analytics=true` localStorage flag).
   - Tailwind CSS CDN (`https://cdn.tailwindcss.com`).
   - Supabase Client v2 (`https://unpkg.com/@supabase/supabase-js@2`).
   - Paystack Inline v2 (`https://js.paystack.co/v2/inline.js`).
   - Vimeo Player SDK (`https://player.vimeo.com/api/player.js` on video routes).
   - jsPDF UMD (`https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js` on audit/export routes).
   - Chart.js (`https://cdn.jsdelivr.net/npm/chart.js` on analytics and partner routes).
2. **Body Termination Loading Order**:
   - `js/main.js`: Responsive navigation, mobile backdrop toggle, collapsible sidebar (`lg:ml-64` to `lg:ml-20`).
   - `js/profile-engine.js`: Profile modal injector, session bootstrap, multi-tenant state resolution, crop-pack gating, and Paystack billing engine.
   - Route-specific scripts: Executed on `DOMContentLoaded` or after `profile-engine.js` has established `window.dbClient`.

### Shared Component Injection
- Dynamic multi-page injection is handled by `injectProfileModalContainer()` in `profile-engine.js`.
- Authenticated pages (`vault.html`, `module.html`, `records.html`, `risk-assessments.html`, `sop.html`, `support.html`) do not duplicate the 500-line profile modal DOM; instead, they asynchronously fetch and inject `profile-modal.html` into `document.body` before binding authentication and tab triggers.

---

## 3. Backend & Supabase

### Database Architecture
- **Supabase PostgreSQL Host**: `https://ujhfkvoaaebdntuheyqo.supabase.co`
- **Client Configuration**: Initialized as `window.dbClient` (and aliased to `window.supabaseClient`) using public anonymous JWT key.

### Multi-Tenant Database Rules (Tenant Isolation)
- **Tenant Key**: **`company_id`** (UUID foreign key referencing `companies.id`).
- All multi-tenant tables (`profiles`, `training_records`, `company_risk_assessments`, `company_baseline_assessments`, `support_tickets`, `crop_pack_addon_subscriptions`) enforce isolation by `company_id`.
- Tenant users belong to an organization defined in `companies`.
- Generic catalog items (`videos`, `sops`) have `company_id IS NULL` to indicate global master availability. Custom branded items (e.g. proprietary estate footage for Doveton Farms, Elliott Farms, Outlook Farms) have a non-null `company_id` and are filtered exclusively to users belonging to that tenant.

### Core Database Tables & Models
| Table Name | Primary Key | Key Columns | Purpose |
| :--- | :--- | :--- | :--- |
| `companies` | `id` (UUID) | `name`, `vat_number`, `phone`, `postal_address`, `contact_email`, `tier`, `seat_limit`, `sponsored_crop_packs` (text[]), `purchased_crop_packs` (text[]), `partner_grower_codes` (text[]), `unlock_all_crops` (bool), `is_subsidized` (bool), `paystack_subscription_code`, `subscription_status`, `cancelled_at` | Primary tenant accounts. Encapsulates billing state, crop packs, seat limits, and subsidy links. |
| `profiles` | `id` (UUID $\to$ `auth.users.id`) | `company_id`, `first_name`, `last_name`, `role`, `tier`, `avatar_url` | User profile linked 1:1 with Supabase Auth users. Maps user to tenant company and seat permissions. |
| `videos` | `id` (Text) | `title`, `description`, `category`, `sub_tag`, `language`, `thumbnail_url`, `partner_thumbnails` (JSONB), `total_seconds`, `company_id` | Master and tenant-specific video training modules. |
| `sops` | `id` (UUID) | `title`, `description`, `category`, `sub_tag`, `doc_url`, `video_id`, `company_id`, `partner_docs` (JSONB) | Standard Operating Procedures documentation and partner-branded override links. |
| `user_video_progress` | Composite (`user_id`, `video_id`) | `progress_seconds`, `duration_seconds`, `percentage`, `is_completed`, `video_title`, `updated_at` | Granular per-user video watch progress and completion milestones. |
| `training_records` | `id` (UUID) | `company_id`, `module_title`, `trainee_name`, `employee_id`, `supervisor_name`, `supervisor_signature_data`, `employee_signature_data`, `batch_session_id`, `training_type`, `status`, `completed_at` | Tamper-evident employee statutory training sign-offs with canvas signatures. |
| `baseline_ra_templates` | `id` (UUID) | `title`, `category`, `hazards_register` (JSONB), `legal_framework`, `version` | Master statutory Baseline Risk Assessment templates. |
| `company_baseline_assessments` | `id` (UUID) | `company_id`, `template_id`, `title`, `category`, `assessment_date`, `review_due_date`, `designated_person_name`, `designated_person_signature`, `hazards_register` (JSONB), `status` | Tenant-authorized annual Baseline Risk Assessments under OHSA. |
| `risk_assessment_templates` | `id` (UUID) | `title`, `category`, `task_description`, `matrix_data` (JSONB) | Issue-based and task-specific risk assessment master templates. |
| `company_risk_assessments` | `id` (UUID) | `company_id`, `template_id`, `title`, `category`, `assessment_data` (JSONB), `status` | Tenant customized task-specific risk assessments. |
| `corporate_partners` | `id` (UUID) | `name`, `logo_url`, `sponsored_crop_pack`, `contact_email`, `slug`, `total_allotted_growers` | Commercial processor/packhouse partners sponsoring grower networks. |
| `partner_grower_registry` | `grower_code` (Text) | `partner_id`, `claimed_by_company_id`, `is_claimed` | Registry of issued grower codes and their claiming farm enterprise. |
| `partner_portal_tokens` | `id` (UUID) | `partner_id`, `token` (UUID), `expires_at`, `revoked_at` | Encrypted, 35-day revolving magic link tokens for partner compliance portals. |
| `crop_pack_addon_subscriptions` | `id` (UUID) | `company_id`, `crop_name`, `paystack_subscription_code`, `paystack_email_token`, `status`, `cancelled_at` | Paystack recurring subscriptions for self-funded R80/mo bolt-on packs. |
| `support_tickets` | `id` (UUID) | `user_id`, `company_id`, `user_name`, `user_email`, `ticket_type`, `subject`, `message`, `status` | In-app support and ticket submissions. |
| `processor_referral_leads` | `id` (UUID) | `crop_name`, `processor_name`, `contact_person`, `contact_email`, `contact_phone`, `notes` | Commercial pipeline leads submitted when growers refer their processors. |
| `avatars` (Storage Bucket) | Object path (`${userId}/avatar.${ext}`) | Public URL cached on `profiles.avatar_url` | Storage bucket for user avatars. |

### Stored Procedures & RPC Patterns
- **`validate_grower_code(p_grower_code)`**: Reads `partner_grower_registry` and joins `corporate_partners`. Validates whether a grower code is authentic, unexpired, and available for claim.
- **`claim_additional_grower_subsidy(p_grower_code)`**: `SECURITY DEFINER` function. Authenticates caller session, claims the code in `partner_grower_registry`, appends the crop to `companies.sponsored_crop_packs`, and automatically drains/removes any existing self-funded bolt-on for that crop.
- **`provision_company_subscription(...)`**: `SECURITY DEFINER` function. Executed immediately post-checkout to atomically create or update the company record, assign tier and seat limits, link claimed grower codes, and create the primary Master Admin profile.
- **`purchase_crop_pack_addon(p_company_id, p_user_id, p_crop_name, p_paystack_ref)`**: **Strictly granted to `service_role` only**. Called exclusively by the server-side `paystack-webhook` Deno edge function. Idempotent on `paystack_ref`; appends crop to `companies.purchased_crop_packs`. Browser clients are forbidden from calling this RPC.
- **`upgrade_company_tier(p_target_tier, p_paystack_ref)`**: Upgrades organization tier and resets seat limits upon verified payment.
- **`remove_team_member(p_target_user_id)`**: `SECURITY DEFINER` function. Disassociates a manager profile from a tenant. Solves the Supabase RLS infinite recursion trap (PostgreSQL error `42P17`) by evaluating admin authorization server-side in a single atomic step.
- **`provision_company_baseline_register(p_company_id)`**: Populates statutory baseline assessment entries from master templates for new tenant workspaces.
- **`get_partner_portal_data(p_token)`**: Validates 35-day portal tokens and returns aggregate compliance data, grower adoption KPIs, and module velocity without exposing raw multi-tenant tenant data.
- **`submit_processor_referral(p_crop_name, p_processor_name)`**: Secure intake of processor leads.

### Row Level Security (RLS) & Auth Policies
- **Row Level Security**: Enabled across all tables in `public`.
- **Tenant Scope**: Read and write access is restricted to rows where `company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())`.
- **User Ownership**: Direct updates to `profiles` are restricted to `id = auth.uid()`.
- **Suspension Bouncer**: When `companies.subscription_status` is `suspended`, `cancelled`, or `deactivated`, `profile-engine.js` blocks workspace access and displays the reactivation terminal.

---

## 4. Third-Party Integrations

### Paystack Payment & Subscription Infrastructure
- **SDK**: Paystack Inline v2 (`https://js.paystack.co/v2/inline.js`).
- **Live Public Key**: `pk_live_6e9ead28ba957dc643c949c5dc8164e3d62c0d09`
- **Plan Codes & Tiers**:
  - **Basic**: `PLN_q37eti0fct6aazv` (1 Admin Seat, Core modules, free/entry).
  - **Essential**: `PLN_glbt6ice9adjj45` (4 Manager Seats, Full catalog, R280/mo).
  - **Enterprise (Retail Full Price)**: `PLN_xx7w3l93tke10kh` (8 Seats, Priority support, all crop packs unlocked, R450/mo).
  - **Enterprise (Corporate Subsidized)**: `PLN_v8iouh4li43y60u` (8 Seats, 25% processor-subsidized, R337.50/mo).
  - **Crop Pack Addon Bolt-On**: `PLN_8n5qrpeh23evvnu` (R80/mo per crop).
- **Paystack Webhook (`/supabase/functions/paystack-webhook`)**:
  - Verifies HMAC SHA512 signature using `x-paystack-signature` header and `PAYSTACK_SECRET_KEY`.
  - Handles `subscription.create` for bolt-on recurring subscription tracking in `crop_pack_addon_subscriptions`.
  - Handles `charge.success` for one-time crop-pack purchases, invoking `purchase_crop_pack_addon` via service role.
  - Opportunistically drains the cancellation queue (`status = 'pending_cancellation'`) by invoking Paystack's subscription disable endpoint.

### Vimeo Player SDK & Video Streaming
- **SDK**: Vimeo Player API (`https://player.vimeo.com/api/player.js`).
- Embedded in `module.html` with parameters `title=0&byline=0&portrait=0&badge=0&autoplay=1`.
- **Progress Tracking & Sync**:
  - Listens to `timeupdate`, `pause`, and `ended`.
  - Client-side throttling buffers sync operations to once every 5 seconds.
  - Updates `user_video_progress` (`progress_seconds`, `duration_seconds`, `percentage`).
  - Sets `is_completed = true` once playback crosses 90% of total duration.
  - Emits Google Analytics 4 event `video_complete`.

### Resend Transactional Mail Engine
- **Endpoint**: Direct HTTPS calls to `https://api.resend.com/emails` within Deno edge functions using `RESEND_API_KEY`.
- **Functions**:
  1. `notify-referral-lead`: Triggered when growers refer a processor. Dispatches branded HTML notification to `luca@simpleza.co.za` with raw values HTML-escaped.
  2. `notify-support-ticket`: Triggered when users submit tickets in `support.html`. Dispatches email to support team with `reply_to` set to user's registered email.
  3. `partner-monthly-digest`: Cron-triggered batch dispatch of monthly supply chain compliance digests to corporate partner contacts. Generates encrypted 35-day magic link tokens (`partner-portal.html?token=...`).

### Compliance, PDF Generation & External Workflows
- **Client-Side PDF Engines**: `jspdf.umd.min.js` renders statutory landscape and portrait certificates:
  - OHSA statutory baseline assessments with risk matrix headers, hazard schedules, and Section 16(2) signatures.
  - Verified training certificates with employee ID numbers, supervisor signatures, and audit timestamps.
  - Corporate partner compliance summary certificates and CSV exports.
- **External Workflows (`systems.html`)**: Architecture references automated procurement intake, ClickUp task synchronization, and construction Gantt milestones.
- **Google Analytics 4 (GA4)**: Tag `G-L0HP7V44GT` tracks ecommerce purchases, module completions, and audit submissions, with automatic suppression on `localhost` and for internal users (`disable_analytics=true`).

---

## 5. Route & File Map

| Path / File | Purpose | Primary Backend & Script Dependencies |
| :--- | :--- | :--- |
| [`index.html`](file:///home/luca/dev/the-vault-web/index.html) | Public landing page, marketing video carousel, pricing matrix, Paystack subscription checkout, grower code validator, and login modal. | Supabase Auth, `videos` (master catalog), `validate_grower_code`, `provision_company_subscription`, Paystack Inline v2, GA4. |
| [`vault.html`](file:///home/luca/dev/the-vault-web/vault.html) | Authenticated training catalog dashboard. Displays continue watching banner, category filters, progress indicators, crop-pack gating locks, and bolt-on purchase modals. | `videos`, `user_video_progress`, `profiles`, `companies`, `claim_additional_grower_subsidy`, `submit_processor_referral`, `profile-engine.js`, `main.js`. |
| [`module.html`](file:///home/luca/dev/the-vault-web/module.html) | Interactive video classroom & compliance sign-off terminal. Embeds Vimeo player, tracks watch progress, and captures supervisor/worker digital signatures. | Vimeo Player API, `videos`, `user_video_progress`, `training_records`, `profiles`, `companies`, `profile-engine.js`, `main.js`. |
| [`partner-portal.html`](file:///home/luca/dev/the-vault-web/partner-portal.html) | Zero-login corporate partner portal. Evaluates 35-day tokens to display grower adoption, BRA compliance, Chart.js visuals, CSV exports, and statutory PDF certificates. | `get_partner_portal_data` RPC, Chart.js, jsPDF, Tailwind CDN. |
| [`records.html`](file:///home/luca/dev/the-vault-web/records.html) | Employee training audit register. Displays verified completions, supervisor signatures, batch session logs, PDF certificates, and enforces monthly export quotas. | `training_records`, `companies`, `profiles`, jsPDF, `profile-engine.js`, `main.js`. |
| [`risk-assessments.html`](file:///home/luca/dev/the-vault-web/risk-assessments.html) | Statutory OHSA risk assessment module. Houses Baseline Risk Assessments (BRAs) and task-specific risk registers, annual review authorizations, and landscape A4 PDF export. | `baseline_ra_templates`, `company_baseline_assessments`, `risk_assessment_templates`, `company_risk_assessments`, `provision_company_baseline_register`, jsPDF. |
| [`sop.html`](file:///home/luca/dev/the-vault-web/sop.html) | Standard Operating Procedures repository. Searchable SOP library with category filters, crop pack gating, and partner-branded document download overrides. | `sops`, `companies`, `profiles`, `claim_additional_grower_subsidy`, `submit_processor_referral`, `profile-engine.js`, `main.js`. |
| [`invite.html`](file:///home/luca/dev/the-vault-web/invite.html) | Manager onboarding portal. Enforces seat caps, supports Google OAuth or email/password signup, and attaches user to the inviting company. | Supabase Auth, `companies`, `profiles`, Tailwind CDN. |
| [`support.html`](file:///home/luca/dev/the-vault-web/support.html) | In-app support ticket intake form. Allows users to submit technical and operational support requests directly into Supabase. | `support_tickets`, `profiles`, `companies`, `profile-engine.js`, `main.js`. |
| [`systems.html`](file:///home/luca/dev/the-vault-web/systems.html) | Enterprise showcase illustrating PM suites, Procurement architecture, and Construction ERP workflows with screenshot modal galleries. | Static HTML/CSS, Vanilla JS gallery engine. |
| [`profile-modal.html`](file:///home/luca/dev/the-vault-web/profile-modal.html) | Master profile & organization management modal dynamically fetched and injected into all authenticated pages by `profile-engine.js`. | Injected into DOM; controlled by `profile-engine.js`. |
| [`404.html`](file:///home/luca/dev/the-vault-web/404.html) | Custom error page for invalid routes. | Static Tailwind HTML. |
| [`js/main.js`](file:///home/luca/dev/the-vault-web/js/main.js) | Sidebar layout controller, mobile menu toggles, and active navigation route synchronization. | Native DOM manipulation. |
| [`js/profile-engine.js`](file:///home/luca/dev/the-vault-web/js/profile-engine.js) | Core platform engine: session lifecycle, dynamic modal injection, multi-tenant state resolution, crop-pack gating, seat limits, and Paystack upgrade handlers. | Supabase Client, Paystack Inline v2, Storage API, DOM APIs. |
| [`supabase/config.toml`](file:///home/luca/dev/the-vault-web/supabase/config.toml) | Supabase CLI local and edge function configuration specifying function entrypoints and JWT verification rules. | Supabase CLI. |
| [`supabase/functions/paystack-webhook/index.ts`](file:///home/luca/dev/the-vault-web/supabase/functions/paystack-webhook/index.ts) | Deno edge function verifying HMAC SHA512 signatures, handling Paystack events, and invoking `purchase_crop_pack_addon`. | Deno, Supabase Admin Client, Paystack API. |
| [`supabase/functions/notify-referral-lead/index.ts`](file:///home/luca/dev/the-vault-web/supabase/functions/notify-referral-lead/index.ts) | Deno edge function dispatching transactional emails via Resend when a grower submits a processor referral. | Deno, Resend API. |
| [`supabase/functions/notify-support-ticket/index.ts`](file:///home/luca/dev/the-vault-web/supabase/functions/notify-support-ticket/index.ts) | Deno edge function dispatching transactional emails via Resend when a user submits a support ticket. | Deno, Resend API. |
| [`supabase/functions/partner-monthly-digest/index.ts`](file:///home/luca/dev/the-vault-web/supabase/functions/partner-monthly-digest/index.ts) | Cron-triggered Deno edge function generating revolving 35-day tokens and emailing compliance digests to corporate partners. | Deno, Supabase Admin Client, Resend API. |
| [`docs/*.pdf`](file:///home/luca/dev/the-vault-web/docs) | Statutory legal documentation, POPIA agreements, Underwriter terms, and Master Terms of Service. | Static PDF documents. |

---

## 6. Hard Architectural Constraints

### Security Rules
1. **Never Expose Sensitive Keys**:
   - The client browser must **only ever** receive the Supabase anonymous public key (`window.supabaseClient`) and Paystack public key (`pk_live_...`).
   - `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and `RESEND_API_KEY` must **never** appear in client-side HTML, JavaScript, or git commits. They belong exclusively in Supabase Edge Function environment variables.
2. **Strict Multi-Tenant Scoping**:
   - Every database query for tenant data must filter by `company_id`.
   - Never allow client queries to update `companies.tier`, `companies.seat_limit`, or `companies.sponsored_crop_packs` directly. All entitlement mutations must be mediated by `SECURITY DEFINER` RPCs or verified server-side webhooks.
3. **Paystack Signature Verification**:
   - The Paystack webhook endpoint must always verify the HMAC SHA512 signature in `x-paystack-signature` using `PAYSTACK_SECRET_KEY` before reading request bodies.
4. **HTML Sanitization in Notifications**:
   - Edge functions rendering email templates with user input (e.g. `notify-referral-lead`, `notify-support-ticket`) must pass all user-controlled text through `escapeHtml()` to eliminate HTML/script injection risks.

### Zero-Build Guidelines
1. **No Client Node.js Toolchains**:
   - Do not install Vite, Webpack, esbuild, Babel, or Parcel for client assets.
   - Do not run `npm build` or `npm run build` in CI/CD. Cloudflare Pages must serve raw files directly.
2. **Native ES6+ in Browsers**:
   - Use standard ES6 features supported natively by modern browsers (`async/await`, optional chaining, modules, template literals).
   - Do not write JSX, TypeScript, or Sass in the frontend web directories.
3. **Tailwind via CDN**:
   - Maintain styling strictly using Tailwind utility classes configured through the official Tailwind CDN script.

### Forbidden Patterns
- **No Infinite RLS Recursion (Error `42P17`)**:
  - Never write an RLS policy on `profiles` that queries `profiles` to check if `role = 'Admin'`. Doing so triggers infinite recursion in PostgreSQL. Use dedicated `SECURITY DEFINER` stored procedures (e.g., `remove_team_member`) for multi-profile administration.
- **No Stale Profile Overwrites on Auth**:
  - During OAuth callbacks or invite linking, never overwrite an existing user's `profiles.company_id` with a stale value from `localStorage`. Check if the user already has an established profile before applying an invite parameter.
- **No Direct Table Writing for Gated Crops**:
  - Unlocking crop packs must occur exclusively through `validate_grower_code` $\to$ `claim_additional_grower_subsidy` or through verified Paystack webhooks triggering `purchase_crop_pack_addon`.

---

## 7. Changelog & Current State

### Baseline Entry (2026-09-26)
- **Repo Restructuring & Audit**: Completed comprehensive audit of all HTML routes, Deno edge functions, client JS engines, and legal documents.
- **Platform Directory Restructuring (`v3-dev`)**:
  - Migrated legacy `assets/java_files/` to `js/` (`js/main.js`, `js/profile-engine.js`) and established `js/modules/`.
  - Realigned master branding assets to `assets/branding/` (`Simple_Logo.jpg`, `Simple_Logo-removebg-preview.png`, `Simple_Logo-White.png`).
  - Updated all HTML script tags and favicon/image asset references to new locations.
  - Initialized `.ai/ARCHITECTURE.md` and `AGENTS.md` defining strict zero-build rules, preserved root HTML entry points, and multi-tenant RLS constraints.
- **Standardized Multi-Tenant Field**: Confirmed full standardization on `company_id` across `profiles`, `companies`, `training_records`, and assessment tables.
- **Crop-Pack Stacking Architecture (Layer 1, 2, 3)**:
  - *Layer 1 (Core Farm Safety)*: Universal farm modules (general safety, workshops, irrigation, fleet) accessible to all tiers without co-branding.
  - *Layer 2 (Specialized Crop Packs)*: Gating operational for Macadamia, Banana, and Citrus packs via subsidized grower codes or R80/mo bolt-on add-ons.
  - *Layer 3 (Partner Attribution)*: Co-branding badges, topbar partner pill, and footer sponsor chains dynamically populated from `partner_grower_registry` joins.
- **Paystack Webhook & Edge Security**:
  - Secured `purchase_crop_pack_addon` RPC with `service_role` privileges, preventing client-side execution.
  - Hardened HMAC verification on `/supabase/functions/paystack-webhook`.
  - Added timing-safe authorization guards and HTML escaping to `/supabase/functions/notify-referral-lead`.
- **Closer Protocol Configuration**:
  - Verified `.agents/agents/closer/agent.md` protocol to maintain and update this `PROJECT_BRAIN.md` at the conclusion of every development session.

### Mobile Optimization & Responsive Audit Pass (2026-09-26)
- **Eliminated Horizontal Overflow & Blowout (< 768px Viewports)**:
  - Fixed scaling overflow in `index.html` on the featured Essential Vault card (`scale-100 lg:scale-105 hover:scale-[1.02] lg:hover:scale-[1.07]`), preventing viewport blowout on 360px–414px mobile devices.
  - Ensured `<meta name="viewport" content="width=device-width, initial-scale=1.0">` is uniformly enforced across all 11 HTML entry points.
- **Top Bars & Dynamic Controls**:
  - Re-anchored topbar dropdowns (`topbar-sponsor-dropdown`, `notification-dropdown`) across `vault.html`, `records.html`, `sop.html`, `risk-assessments.html`, `support.html`, and `module.html` to fluid widths (`w-[calc(100vw-2rem)] max-w-xs sm:w-72` and `w-[calc(100vw-2rem)] max-w-sm`) to prevent clipping off-screen.
  - Added smooth text truncation (`truncate max-w-[140px]`) to company names in desktop and tablet headers.
  - Truncated partner identity badge elements in `partner-portal.html` (`truncate max-w-[90px]`, `truncate max-w-[70px]`, `max-w-[200px] sm:max-w-none`).
- **Sidebar & Mobile Drawer Behavior**:
  - Inserted missing `#sidebar-backdrop` into `risk-assessments.html` for clean overlay dimming and backdrop-click closing.
  - In `js/main.js`: Bound body scroll locking (`document.body.classList.add/remove('overflow-hidden')`) upon drawer open/close. Added `Escape` key close listener and window `resize` handler that auto-dismisses drawer when scaling up to desktop (>= 1024px).
- **Search Bars, Filters & Tab Strips**:
  - Refactored search inputs and filter `<select>` dropdowns across all catalog and table pages to stack full-width vertically on mobile with 44px touch targets (`py-2.5 min-h-[44px]`).
  - Added cross-browser `.no-scrollbar` styling rules across all views and applied horizontal scroll strips (`flex overflow-x-auto no-scrollbar gap-2 pb-1/pb-2`) to category pills, baseline filters, and status tabs.
- **Data Grids, Cards & Data Tables**:
  - Refactored dynamic SOP cards in `sop.html` and Baseline Assessment cards in `risk-assessments.html` with responsive inner padding (`p-4 sm:p-6`) and full-width, touch-friendly action buttons (`w-full sm:w-auto min-h-[38px]`).
  - Ensured wide compliance tables (`records.html`, `risk-assessments.html`, `partner-portal.html`) are isolated within dedicated horizontal scroll containers (`w-full overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0`).
- **Modals & Overlays**:
  - Refactored `#profileModal` in `profile-modal.html`: modal container converted to fluid responsive flex layout (`p-0 sm:p-4`, `h-full sm:h-[600px] flex flex-col sm:flex-row`), navigation converted to horizontally scrollable tab bar (`flex overflow-x-auto no-scrollbar flex-nowrap shrink-0 border-b`), headings responsive (`text-2xl sm:text-3xl`), and close button offset adjusted.
  - Refactored `#vaultUpgradeReviewModal`, `#newAssessmentModal`, `#baselineReviewModal`, and `#inspectBaselineModal` footers to `flex flex-col-reverse sm:flex-row items-stretch sm:items-center` with full-width primary action buttons on mobile.

### Upcoming Priority Tasks
1. **Citrus Processing Pack**: Finalize dedicated SOP documentation and master risk assessment templates for citrus harvesting, packing, and cold-storage operations.
2. **Paystack Bolt-On Automation**: Verify live webhook processing of `charge.success` events for `PLN_8n5qrpeh23evvnu` across production testing farms.
3. **Cloudflare Security Headers**: Configure `_headers` file in Cloudflare Pages to enforce strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), and frame options.