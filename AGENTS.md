# Project architecture

This project recreates the original FART AI kitchen demo using its static client assets. Preserve the reference design and functionality unless a request asks for a redesign.

- `public/index.html`: all app views, dialogs, SVG icon definitions, and share metadata.
- `public/styles.css` and `public/refresh.css`: original responsive layout and design overrides.
- `public/storage.js`: bootstraps saved data from the API before sequentially loading the original global scripts. Exposes the synchronous `FartStorage` adapter backed by serialized database writes, with visible error/retry feedback.
- `public/core.js`: food model, ranking, reminders, grocery memory and demo date logic.
- `public/profiles.js`: fictional profiles, profile state and recipes.
- `public/app.js`, `dashboard.js`, `food-search.js`, `scan.js`: browser interface and interactions, loaded in the order declared in HTML.
- `public/catalog.js`, `reference-data.js`, `meal-labels.js`: static reference datasets, not user persistence.
- `public/vision.js` and `public/vision/`: on-device image recognition, label OCR, QR generation, bundled libraries and models. Large models load only when scanning is used. Preserve model shard filenames and paths.
- `netlify/server/index.ts`: GET/PUT `/api/kitchen`; browser workspaces are isolated by an HTTP-only secure cookie. The API has same-origin write checks, payload validation, and no-store responses.
- `db/schema.ts`, `db/index.ts`: Drizzle schema and native Netlify Database adapter.
- `netlify/database/migrations`: generated migrations applied automatically on deploy.

Use Node 24 for the Netlify Server. Static files are published directly from `public`; avoid a catch-all rewrite because it would intercept API requests. There is no frontend build step. Keep one server entrypoint.

Use Netlify Database for all persistent application state; do not replace it with browser localStorage, local files, or process memory. The browser adapter temporarily holds pending edits while saving and warns before navigation when edits remain unsaved. Anonymous cookie workspaces preserve the source demo's per-browser behavior; they are not an account authentication system.

The original browser code uses shared classic-script globals. Maintain script ordering and HTML element IDs. Escape user-entered text before rendering HTML. Photos remain in the browser and are never persisted. Keep the original scan confirmation flow and clearly distinguish estimates from printed food dates.

Schema changes require generated migrations. Do not manually run database migrations. Follow platform validation rules and avoid generating frontend build artifacts in the repository.
