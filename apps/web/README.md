# Linx School web app (design build)

The screens for every role, with demo data. Nothing here calls the API yet.

```bash
pnpm install
pnpm dev:web        # http://localhost:3000
```

Open `/` and pick a portal, or use the profile card at the top of the sidebar to switch roles.

| Role | Start page | Screens |
| --- | --- | --- |
| Super admin | `/super-admin` | Dashboard, Schools, Billing, Question Bank, Platform Users |
| School admin | `/admin` | Dashboard, Students, Staff, Classes & Subjects, Results (broadsheet, report card), Attendance, Fees, Messages |
| Teacher | `/teacher` | Dashboard, My Classes, Score Entry, Attendance, CBT Tests, Timetable |
| Student | `/student` | Dashboard, My Subjects, AI Exam Prep, CBT Tests (with test-taking screen), My Results, Timetable |
| Parent | `/parent` | Dashboard, Results, Fees & Payments, Attendance, Messages |

Every role also has Account Settings and Help & FAQs.

## How it is built

- Next.js 15 (App Router), React 19, Tailwind CSS 4.
- Components follow the shadcn/ui pattern: small files in `src/components/ui` that we own and edit.
- Charts are plain SVG/CSS (`src/components/charts`), so there is no chart library to download. Shared JS on first load is about 100 KB.
- Theme colours live in `src/app/globals.css` (`brand-*` purple, `orchid-*` pink).
- Report cards print on one A4 page (`Print / Save PDF`); the app chrome is hidden when printing.
- Demo data is in `src/lib/mock.ts`; the menu for each role is in `src/lib/roles.ts`.
