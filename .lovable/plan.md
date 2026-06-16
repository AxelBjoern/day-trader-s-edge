# Fix: Signals / Orders / Performance / Jobs / Settings / Logs not opening

## Root cause

TanStack Router's flat-file routing treats `src/routes/_authenticated/dashboard.tsx` as the **parent layout** for every sibling whose name starts with `dashboard.` (`dashboard.signals.tsx`, `dashboard.orders.tsx`, `dashboard.performance.tsx`, `dashboard.jobs.tsx`, `dashboard.settings.tsx`, `dashboard.logs.tsx`).

A parent layout route's component must render `<Outlet />` so its children can mount. Right now `dashboard.tsx` renders the full overview UI and never renders `<Outlet />`. Result: clicking a nav link does change the URL to `/dashboard/signals` (etc.), the route matches, but the child page has nowhere to render, so the Dashboard overview stays on screen and the click feels like a no-op.

## Fix

Split the file in two, following the canonical TanStack pattern:

1. **Rename** `src/routes/_authenticated/dashboard.tsx` → `src/routes/_authenticated/dashboard.index.tsx`
   - Update the route string from `createFileRoute("/_authenticated/dashboard")` to `createFileRoute("/_authenticated/dashboard/")` (the index leaf for `/dashboard`).
   - Keep all the existing overview component, stats, cron card, recent signals/orders tables, scan/close buttons — no logic changes.

2. **Create a new** `src/routes/_authenticated/dashboard.tsx` containing only the layout:
   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/_authenticated/dashboard")({
     component: () => <Outlet />,
   });
   ```

3. After the rename, `src/routeTree.gen.ts` will regenerate automatically on the next dev/build cycle — no manual edits to it.

## Verification

- `/dashboard` still renders the overview (now via the `index` leaf inside the new layout).
- `/dashboard/signals`, `/dashboard/orders`, `/dashboard/performance`, `/dashboard/jobs`, `/dashboard/settings`, `/dashboard/logs` each mount their own page through the layout's `<Outlet />`.
- The header nav, sign-out, and auth gate in `_authenticated/route.tsx` are untouched.

## Out of scope

No changes to server functions, Supabase schema, Gmail/IG integration, cron, or any page UI. This is purely the routing wrapper fix.
