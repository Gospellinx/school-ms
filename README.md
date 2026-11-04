# school-ms

School management and exam-prep platform for Nigerian schools (nursery, primary, JSS and SS).
This first slice covers the part schools feel every term: **setting up the school, entering scores, and producing broadsheets and report cards**.

## What works today

- **School sign-up** with default sections (Nursery, Primary, Junior Secondary, Senior Secondary), each with its own grading scale and score split (1st CA 20, 2nd CA 20, Exam 60 by default; WAEC A1 to F9 for SS, A to F for the rest).
- **Staff accounts** for proprietor, admin and teacher. Staff log in through their school's address (`schoolSlug`).
- **Academic setup**: sessions (e.g. 2025/2026) with First, Second and Third term, classes and arms, subjects, and which teacher takes each subject in each class.
- **Students**: add one at a time, or import a class from a spreadsheet saved as CSV (safe to re-upload).
- **Score entry**: a score sheet per class and subject. Teachers can only enter scores for subjects they are assigned to.
- **Results**: class broadsheet with totals, averages and positions (ties share a position), and a report card per student with grades, subject positions, class statistics and teacher and head comments.
- **Tenant isolation**: every school's data is separated by Postgres row-level security, tested end to end.

## Layout

```
apps/api        NestJS API (REST), Drizzle ORM, PostgreSQL
packages/core   Pure TypeScript logic: grading scales, totals, ranking, class results
```

## Run it locally

Requires Node 22, pnpm 10 and PostgreSQL 16 (or Docker).

```bash
pnpm install
docker compose up -d            # or use your own Postgres
cp apps/api/.env.example apps/api/.env
pnpm db:migrate                 # creates tables and row-level security policies
pnpm db:seed                    # demo school: gcis-demo / proprietor@demo.test / demo-password
pnpm dev:api                    # http://localhost:3001/api
```

Tests need a separate database (`schoolms_test`, wiped on every run):

```bash
createdb -U schoolms schoolms_test
pnpm test
```

## API overview

All routes are under `/api` and need `Authorization: Bearer <token>` except sign-up, login and health.

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register-school` | anyone |
| POST | `/auth/login` | anyone |
| GET | `/auth/me` | staff |
| GET, POST | `/sessions` | staff, leadership to create |
| POST | `/terms/:id/make-current` | leadership |
| GET, PATCH | `/sections`, `/sections/:id` | staff, leadership to edit grading |
| GET, POST | `/classes`, `/subjects`, `/staff` | leadership to create |
| GET, POST | `/classes/:id/subjects` | leadership to assign |
| GET, POST | `/students`, `/students/import` | leadership to create |
| GET, PUT | `/terms/:termId/classes/:classId/subjects/:subjectId/scores` | assigned teacher or leadership |
| GET | `/terms/:termId/classes/:classId/results` | staff |
| GET | `/terms/:termId/students/:studentId/report-card` | staff |
| PUT | `/terms/:termId/students/:studentId/comments` | teacher comment: staff; head comment: leadership |

"Leadership" means the proprietor or an admin.

## Next

1. Web app: school dashboard, score entry grid, printable report cards (PDF).
2. AI-drafted report card comments.
3. Parent access to results, and fee collection through Paystack.
4. Question bank and CBT tests for every class, with AI explanations.
