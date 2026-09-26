# Master Agent Guidelines & Operational Rules

> **The Vault Web Platform — Developer & Agent Instruction Manifest**  
> *Target Repository: `the-vault-web` | Active Branches: `main`, `v3-dev`*

---

## 1. Absolute Invariants & Master Rules

Every AI agent and human developer operating in this repository must strictly adhere to these immutable rules:

### Rule 1: Root HTML Entry Points Must Remain Preserved
- **Do NOT nest root `.html` files into subdirectories** (such as `src/`, `pages/`, `public/`, or `views/`) without express confirmation.
- Cloudflare Pages static site hosting maps routes directly to the repository root:
  - `/` $\to$ `index.html`
  - `/vault.html` $\to$ `vault.html`
  - `/module.html` $\to$ `module.html`
  - `/records.html` $\to$ `records.html`
  - `/risk-assessments.html` $\to$ `risk-assessments.html`
  - `/sop.html` $\to$ `sop.html`
  - `/partner-portal.html` $\to$ `partner-portal.html`
  - `/invite.html` $\to$ `invite.html`
  - `/support.html` $\to$ `support.html`
  - `/systems.html` $\to$ `systems.html`
  - `/404.html` $\to$ `404.html`
- Moving these files breaks production navigation and incoming partner/grower links.

### Rule 2: Strictly Zero-Build Frontend Architecture
- **Do NOT introduce Node.js bundlers, compilation steps, or framework migrations.**
- Strictly prohibited: Vite, Webpack, Rollup, Parcel, esbuild, Babel, React, Vue, Svelte, Angular, or TypeScript compilation steps for the browser client.
- All frontend code must execute as native, standard ECMAScript 6+ and HTML5 in modern evergreen browsers.
- Styling must use the official Tailwind CSS CDN script (`https://cdn.tailwindcss.com`). Do not install postcss or preprocessors.

### Rule 3: Strict Multi-Tenant Isolation & RLS Compliance
- **Tenant Key**: All multi-tenant data is isolated strictly by **`company_id`** (referencing `companies.id`).
- All queries accessing tenant-specific rows (`profiles`, `training_records`, `company_risk_assessments`, `company_baseline_assessments`, `support_tickets`) must be scoped by `company_id`.
- Never subquery `profiles` within client-triggered RLS policies to check caller roles, which causes infinite PostgreSQL recursion (error `42P17`). Use `SECURITY DEFINER` RPCs (e.g. `remove_team_member`) instead.
- Sensitive fields on `companies` (`tier`, `seat_limit`, `sponsored_crop_packs`, `purchased_crop_packs`, `subscription_status`) must never be updated directly from the browser; mutations must route through `SECURITY DEFINER` RPCs or authenticated Supabase Edge Functions.

---

## 2. Directory & Asset Standards

- **JavaScript Assets**:
  - Global scripts reside in `js/` (`js/main.js`, `js/profile-engine.js`).
  - Specialized feature modules reside in `js/modules/`.
  - The legacy path `assets/java_files/` is deprecated and must never be referenced.
- **Branding & Logos**:
  - Official brand marks belong in `assets/branding/` (`Simple_Logo.jpg`, `Simple_Logo-removebg-preview.png`, `Simple_Logo-White.png`).
  - Partner corporate marks belong in `assets/logos/`.
  - Workflow screenshots belong in `assets/workflow_pics/`.
- **Backend Edge Functions**:
  - Deno edge functions reside in `supabase/functions/<function-name>/index.ts`.
  - Edge functions must sanitize any user-controlled input prior to HTML email rendering.
  - Webhooks (e.g., Paystack) must verify HMAC signatures before parsing request payloads.

---

## 3. Session Closing Protocol

At the conclusion of each development session:
1. Run `git status` and `git diff` to identify all changed files.
2. Update [`PROJECT_BRAIN.md`](file:///home/luca/dev/the-vault-web/PROJECT_BRAIN.md) with a timestamped entry detailing what was added, modified, or refactored.
3. Keep documentation truthful, concise, and aligned with actual repository state.
