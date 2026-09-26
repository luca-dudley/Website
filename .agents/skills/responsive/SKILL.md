---
name: responsive-vanilla-ui
description: UI conventions for Vanilla HTML5, ES6 modules, and Tailwind CSS.
---
# Frontend Design System
1. **No Node Build Steps**: Do not introduce Vite, Webpack, React, or npm build pipelines. Keep it static HTML5 and native ES6 modules.
2. **Mobile-First Tailwind**:
   - Base classes assume mobile viewport (`w-full flex-col`).
   - Progressive expansion: `sm:`, `md:`, `lg:`.
3. **Clean URLs**: Cloudflare Pages routes extensionless paths directly to `.html` files in root (e.g. `/records` -> `records.html`). Never alter root file paths without planning.
