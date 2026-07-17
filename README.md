# CrownMeMedia

A social voting and royalty-themed media platform where users post photos and videos, earn crowns, battle for regional rankings, and send royal gifts.

## Tech Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Lovable Cloud — auth, database, storage, edge functions
- Bun (package manager, dev/build/test runner)

## Setup

```bash
bun install
bun run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values from your Lovable Cloud project:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_PAYMENTS_CLIENT_TOKEN=
```

`VITE_` values are public browser configuration. Never put service-role keys,
webhook secrets, Stripe secret keys, or other private credentials behind a
`VITE_` prefix.

Never commit a populated `.env` file. Only the placeholder-only `.env.example`
should be checked in. Lovable injects Supabase and Payments configuration for
hosted builds; GitHub Actions reads the four values from repository secrets.

The optional BrowserStack job is disabled by default. To enable it, add the
`BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` repository secrets, then
set the `BROWSERSTACK_ENABLED` repository variable to `true`.

## Build & Test

```bash
bun run build
bunx vitest run
```

## Deployment

The project deploys via Lovable. Use the Publish action in the editor, or connect a custom domain in project settings.
