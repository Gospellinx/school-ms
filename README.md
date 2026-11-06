# school-ms

School management and exam-prep platform for Nigerian schools (nursery, primary, JSS and SS).
It covers setting up the school, scores, broadsheets and report cards, plus parents, attendance, fees through Paystack, SMS and WhatsApp alerts, computer-based tests (CBT) and AI exam prep built on each student's own results.

## What works today

- **School sign-up** with default sections (Nursery, Primary, Junior Secondary, Senior Secondary), each with its own grading scale and score split (1st CA 20, 2nd CA 20, Exam 60 by default; WAEC A1 to F9 for SS, A to F for the rest).
- **Staff accounts** for proprietor, admin and teacher. Staff log in through their school's address (`schoolSlug`).
- **Academic setup**: sessions (e.g. 2025/2026) with First, Second and Third term, classes and arms, subjects, and which teacher takes each subject in each class.
- **Students**: add one at a time, or import a class from a spreadsheet saved as CSV (safe to re-upload).
- **Score entry**: a score sheet per class and subject. Teachers can only enter scores for subjects they are assigned to.
- **Results**: class broadsheet with totals, averages and positions (ties share a position), and a report card per student with grades, subject positions, class statistics and teacher and head comments.
- **Parents**: added one at a time or from the same CSV as students (`parent_name`, `parent_phone`, `parent_email`). One parent with several children is recognised by phone number however it is written (0803..., +234 803...).
- **Parent portal**: parents log in with a 6-digit code texted to their phone. They see their own children only: released results, attendance and fee bills, and pay online.
- **Result release**: results stay hidden from parents and students until leadership publishes a class's term. Publishing texts every parent. A school can choose to withhold report cards while that term's fees are owed.
- **Attendance**: daily register per class by the form teacher or a teacher of the class. Parents of a student newly marked absent today get an alert. Term totals ("times school opened / present / absent") appear on report cards once term dates are set.
- **Fees**: fee items for the whole school, a section or a class; one bill per student per term, safe to regenerate. Cash, transfer and POS payments are recorded by the bursar. Online payment goes through Paystack checkout into the school's own Paystack subaccount, confirmed by a signed webhook and by asking Paystack directly (never by trusting the browser). Receipts and fee reminders go to parents by SMS. A collections summary shows expected, collected and outstanding per class.
- **SMS and WhatsApp**: all parent messages go through an outbox table and a background sender, using Termii (SMS, DND route for login codes, and WhatsApp). Without a Termii key, messages are logged instead of sent. Leadership can message all parents or one class, and see the message log.
- **CBT**: a question bank per subject and topic (typed in, CSV import, or AI drafts a teacher reviews). Teachers set timed tests for their classes; students log in with admission number and PIN. Answers autosave, the clock keeps running if the browser closes, and late attempts are submitted automatically. Teachers see scores and how many got each question right, and can push CBT scores into a score column such as 1st CA.
- **AI exam prep**: each student's profile is worked out from their own report card history (scores, drops since last term, below the WAEC credit line) and CBT topic accuracy. On top of that, Claude writes a two-week study plan, practice sets aim at the weakest topics (never using questions from tests still open), and wrong answers get explained after submitting (cached, with a daily limit per student). Teachers can also get AI-drafted report card remarks.
- **Tenant isolation**: every school's data is separated by Postgres row-level security, tested end to end. The API switches to a restricted `school_app` role inside each school's transaction, so isolation holds even if it connects as a superuser. The role that runs migrations needs `CREATEROLE` (or superuser) the first time, to create `school_app`.

- **Web app** for staff: sign in or register a school, a setup checklist, sessions and terms, classes with subjects and teachers, staff accounts, student import from CSV, a score entry grid that checks scores as you type, the class broadsheet, and report cards that print or save as A4 PDF from the browser. Teachers only see their own class subjects. Works on phones.

## Layout

```
apps/web        Next.js staff web app; talks to the API through its own /bff proxy so the login token stays in an httpOnly cookie
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
pnpm dev:web                    # http://localhost:3000 (set API_URL if the API is elsewhere)
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
| PATCH | `/terms/:id`, `/classes/:id`, `/school` | leadership (term dates, form teacher, school settings) |
| POST, DELETE | `/terms/:termId/classes/:classId/publish` | leadership |
| GET, POST, PATCH | `/guardians`, `/guardians/:id`, `/guardians/:id/students` | staff to view, leadership to change |
| GET, PUT | `/classes/:classId/attendance/:date` | form teacher, teachers of the class, leadership |
| GET | `/terms/:termId/classes/:classId/attendance`, `/students/:id/attendance` | staff |
| POST, GET, DELETE | `/fees/items`, `/terms/:termId/fees/items` | leadership |
| POST | `/terms/:termId/invoices/generate`, `/terms/:termId/fees/reminders` | leadership |
| GET | `/terms/:termId/invoices`, `/terms/:termId/fees/summary`, `/invoices/:id` | leadership |
| POST | `/invoices/:id/payments` (cash, transfer, POS), `/invoices/:id/paystack` | leadership |
| GET, POST | `/fees/paystack/banks`, `/fees/paystack/subaccount` | leadership; subaccount: proprietor |
| POST | `/webhooks/paystack` | Paystack (signed) |
| GET, POST | `/notifications`, `/notifications/broadcast`, `/notifications/dispatch` | leadership |
| POST | `/students/pins/class/:classId`, `/students/:id/reset-pin` | leadership |
| GET, POST, DELETE | `/questions`, `/questions/bulk`, `/questions/import`, `/questions/generate` | staff |
| GET, POST | `/cbt/tests`, `/cbt/tests/:id/publish`, `/close`, `/results`, `/push-scores` | teachers of the subject, leadership |
| GET | `/students/:id/prep-plan` | staff |
| POST | `/terms/:termId/students/:studentId/comments/draft` | staff (AI) |
| POST | `/parent/auth/request-code`, `/parent/auth/verify` | anyone |
| GET | `/parent/me`, `/parent/children/:id/results[/:termId]`, `/attendance`, `/invoices` | parent |
| POST, GET | `/parent/invoices/:id/pay`, `/parent/payments/:reference/verify` | parent |
| POST | `/student/auth/login` | anyone |
| GET, POST, PUT | `/student/me`, `/student/tests`, `/student/tests/:id/start`, `/student/attempts/:id[/answers, /submit]` | student |
| GET, POST | `/student/prep/plan`, `/student/prep/practice`, `/student/prep/explain/:questionId`, `/student/results[/:termId]` | student |

"Leadership" means the proprietor or an admin. Parent and student tokens only work on `/parent/...` and `/student/...` routes. Money is always in kobo (₦1 = 100 kobo), as Paystack uses.

## Keys and sandbox mode

Copy `apps/api/.env.example`. Everything runs without keys: messages are logged instead of sent, and online payment and AI answer "not set up yet".

- **Paystack**: put a test secret key (`sk_test_...`) in `PAYSTACK_SECRET_KEY` and set the webhook URL in the Paystack dashboard to `<api>/api/webhooks/paystack`. Each school connects its bank account once (`POST /fees/paystack/subaccount`), so fees settle straight to the school.
- **Termii**: `TERMII_API_KEY`, an approved `TERMII_SENDER_ID`, and your account's `TERMII_BASE_URL`. WhatsApp needs a WhatsApp sender set up in Termii.
- **Claude**: `ANTHROPIC_API_KEY`. Every AI call is logged in `ai_usage` (tokens per school and student) and limited per student per day.

## Next

1. Printing a whole class's report cards at once.
2. Timetable and admissions.
3. Offline CBT for exam halls with poor internet.
