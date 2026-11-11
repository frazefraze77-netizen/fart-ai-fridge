# FART AI · Your smarter kitchen

A Netlify recreation of the FART AI kitchen demo at https://fart-ai-iota.vercel.app/#fridge. It preserves the original responsive design, four fictional dietary profiles, food catalogue, ingredient editing, expiry reminders, nutrition ranking, tailored meal ideas, shopping memory, QR lists, and camera/photo scanning.

The interface uses plain HTML, CSS, and JavaScript. TensorFlow.js, TensorFlow Lite and Tesseract process food photos and printed labels in the browser. The original model assets are hosted with the app; photos are not uploaded. A Netlify Server and Netlify Database with Drizzle ORM save kitchen data. An HTTP-only browser cookie identifies each anonymous workspace; this is a demo, without user accounts or cross-device sign-in.

## Local development

Use Node.js 24 or later. Install dependencies with `npm install`, link the project using the Netlify CLI, and run `npm run dev`. The site runs at port 8889 with Netlify platform integration. The database is provisioned by Netlify. Schema migrations live in `netlify/database/migrations` and are applied by the deployment platform.

No frontend build command is required. Netlify publishes `public` and runs API requests through `netlify/server/index.ts`. Camera capture requires HTTPS or localhost, browser permission, and a supported browser; photo upload and manual entry remain available.

To change the database schema, edit `db/schema.ts` and run `npm run db:generate -- --name descriptive_change_name`. Do not apply migrations manually.

The demo's food recognition and nutrition estimates retain the original confirmation steps and dietary guidance. Saved data belongs to this browser workspace. Clearing its cookie starts a new workspace.
