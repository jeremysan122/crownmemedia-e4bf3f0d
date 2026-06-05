# CrownMeMedia

A social voting and royalty-themed media platform where users post photos and videos, earn crowns, battle for regional rankings, and send royal gifts.

## Tech Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Lovable Cloud (Supabase) — auth, database, storage, edge functions

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values from your Lovable Cloud project:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

> Never commit a real `.env` file. Only `.env.example` should be checked in.

## Build

```bash
npm run build
```

## Deployment

The project deploys via Lovable. Use the Publish action in the editor, or connect a custom domain in project settings.
