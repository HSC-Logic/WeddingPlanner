# Vow — private wedding planner

Vow is a responsive, offline-first wedding planning app. Couples can manage their profile, checklist, exact-cent budget, guests and RSVPs, vendors and payments, wedding-day timeline, and notes without creating an account or sending personal data anywhere.

## Features

- Guided first-use setup with optional starter checklist
- Dashboard countdown, checklist progress, budget chart, guest totals, upcoming work and next activity
- Local CRUD workflows for checklist, expenses, guests, vendors, timeline and notes
- Reception seating with tables, reserved seats, households, manual locks, conflict reporting, print views and two CSV directories
- Interactive 2D hall designer with room geometry, doors, windows, stages, dance floors, tables, labels, accessibility routes, undo/redo, zoom, print and SVG export
- Search, status updates, overdue indicators, attendee totals and safe contact links
- Versioned JSON backup with validation and preview; CSV exports protected against formula injection
- Light/dark themes, responsive sidebar, print-friendly timeline, keyboard focus, reduced-motion support
- Installable PWA with same-origin offline shell caching

## Stack

React 19, TypeScript strict mode, Vite, Tailwind CSS, Lucide icons, native IndexedDB, native service worker, Vitest and Playwright. Native browser APIs provide the local application shell, calendar-date handling and storage.

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Validation:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Preview production output with `npm run preview`.

## Storage, privacy and backups

Records live in separate, versioned IndexedDB stores. Only theme preference uses localStorage. No backend, authentication, analytics, advertising, trackers, paid API, external database or cloud sync exists. Vendor phone, email and website links activate only after user action.

Seating uses separate `tables`, `households`, and `assignments` stores. Effective capacity is table capacity minus reserved seats. Backup import validates every record, cross-record reference, duplicate assignment, and table capacity before replacing current data. A backup can also be restored directly from first-use setup after clearing the planner.

## Seating algorithm

**Generate seating plan** runs a deterministic best-fit-decreasing heuristic. It validates and preserves valid locked manual assignments, excludes declined guests, excludes pending RSVPs unless provisional mode is enabled, sorts households largest-first, filters compatible table groups, and chooses the table leaving least unused capacity. Households are never split automatically. Items that cannot fit remain unassigned with stable conflict codes and corrective guidance.

This is predictable, not mathematically optimal. Manual table locks handle exceptions. Use **Reset automatic** to remove generated assignments without touching locked manual placements. Seating exports provide table-grouped and alphabetical guest CSV files; browser print produces table cards, household assignments and unresolved conflicts.

Use **Settings & Backup → Export full backup** regularly. Import accepts JSON files up to 5 MB, validates complete structure, shows record counts and asks before replacing current data. Clearing data requires exact phrase `CLEAR MY WEDDING` plus confirmation. Browser resets, private browsing, device loss and switching browsers can remove local data.

## PWA installation

After first successful load, use browser **Install app** or **Add to Home Screen**. Static application files are cached; IndexedDB data is never placed in service-worker cache. New network assets refresh cache while cached shell remains available offline.

## GitHub Pages deployment

1. Push to `main`.
2. In repository **Settings → Pages**, select **GitHub Actions** as source.
3. Workflow validates lint, types, unit tests and build before deployment.

Vite uses relative asset paths, so repository subpaths and refreshes of this single-document navigation work without server rewrites.

## Version 1 limits

- One wedding profile per browser profile; no accounts, sharing, cloud sync, online RSVP page or automatic invitations.
- Forms support create, delete and common inline status changes. Full record editing is limited to wedding details in V1.
- Automatic seating never splits households and does not optimize social relationships beyond preferred table group and best-fit capacity.
- Offline installation requires one successful online production load. Browser storage quotas and eviction policies still apply.
- GitHub Actions runs deterministic unit checks and build. Playwright is available locally but omitted from deploy workflow to keep Pages validation fast.

Future versions may add encrypted multi-device sync, household invitations, recurring reminders, richer record editing and calendar export.
