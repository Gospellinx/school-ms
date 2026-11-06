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
- **AI learning layer** (phases 1 and 2, see [docs/ai-learning-layer.md](docs/ai-learning-layer.md)):
  - **Knowledge base**: teachers and admins upload schemes of work, lesson notes, past questions, marking schemes and textbook extracts (PDF, Word, text, photos) by class, subject and term. The AI answers from the school's own material first and cites it.
  - **AI tutor** for students: a chat per subject and topic that explains at the student's class level, gives worked examples and quizzes, follows the school's scheme of work, and guides students to the answer instead of doing their homework.
  - **Exam prep** for WAEC, NECO, JAMB (UTME) and BECE: practice by subject and topic, timed JAMB-style mocks with explanations, weak-topic tracking, predicted readiness and a week-by-week plan to exam day.
  - **Guardrails**: safety screening of student messages with flags for leadership, a monthly AI allowance per school and a daily limit per student, cost logged per feature.
  - **Teaching Assistant** (phase 2): lesson notes and plans from the scheme of work, tests with marking schemes, help marking written answers against a rubric (the teacher confirms every mark before it reaches the score sheet), report remarks for a whole class, and a list of students falling behind.
  - Works without an Anthropic key: the tutor and knowledge base fall back to the school's notes and question bank.
- **Tenant isolation**: every school's data is separated by Postgres row-level security, tested end to end. The API switches to a restricted `school_app` role inside each school's transaction, so isolation holds even if it connects as a superuser. The role that runs migrations needs `CREATEROLE` (or superuser) the first time, to create `school_app`.

- **Web app** with five portals, all reading and writing the real API and database:
  - **Admin** (proprietor and admin): live dashboard (students, fees collected, today's registers, score entry progress, recent parent messages), students and parents, staff, classes and subjects, results (broadsheet, comments, publish), attendance, fees and bills, messages, and settings (school, calendar, grading, Paystack).
  - **Teacher**: dashboard, my classes, score entry, the daily register, report card comments with an AI draft, and CBT (question bank, tests, results, push scores to a CA column).
  - **Student**: dashboard, subjects, exam prep (practice sets on weak topics, study plan when AI is on), CBT tests with a timer and autosave, a review with explanations, and released report cards.
  - **Parent**: dashboard per child, report cards, attendance day by day, fee bills with Paystack checkout (`/pay/done` confirms the payment), and the messages the school has sent.
  - **Super admin** (Linx School team): every school with headline numbers, question bank counts, proposed billing and platform users.
  - Sign-in sets an httpOnly cookie; middleware keeps each user inside their own portal. Report cards print as A4. Works on phones.
- **Platform super admin**: a separate login (`/platform/...`) for the Linx School team that can see every school's counts, read inside each school's row-level-security scope.

## Layout

```
apps/web        Next.js app for all five portals (src/app/admin, teacher, student, parent, super-admin);
                talks to the API through its own /bff proxy so the login token stays in an httpOnly cookie
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
pnpm db:seed                    # rebuilds the demo schools (see below)
pnpm dev:api                    # http://localhost:3001/api
cp apps/web/.env.example apps/web/.env.local
pnpm dev:web                    # http://localhost:3000 (set API_URL if the API is elsewhere)
```

Build `packages/core` first if the API complains it cannot find it: `pnpm --filter @school-ms/core build`.

### Demo logins

The seed builds a GCIS-style school (`gcis-demo`): nursery to SS 3, 48 students, two terms of published results, a current term with CAs entered, four weeks of registers, fee bills with payments, a WAEC question bank, CBT tests and parent messages. It also adds a small second school (`bright-future-demo`). Running it again deletes and rebuilds both demo schools only.

| Portal | Sign in with |
| --- | --- |
| Proprietor | school `gcis-demo`, `proprietor@demo.test` / `demo-password` (also `admin@demo.test`) |
| Teacher | school `gcis-demo`, `teacher@demo.test` / `demo-password` (form teacher of SS 2 Gold) |
| Parent | school `gcis-demo`, phone `0803 123 4567` (two children). With no SMS key and outside production, the login code is shown on screen. |
| Student | school `gcis-demo`, admission number `GCIS/S/001`, PIN `123456` (every demo student has this PIN) |
| Super admin | "Linx School team sign-in" link, `super@linxschool.test` / `demo-password` |

With `NEXT_PUBLIC_SHOW_DEMO_LOGINS=true` the sign-in page shows one-click demo buttons. Leave it off in production.

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
| GET, PATCH | `/auth/me` | staff (PATCH changes your name) |
| POST | `/auth/password` | staff, with the current password |
| GET | `/dashboard` | staff; leadership also gets school counts, fees, results released and recent messages |
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
| GET, PATCH | `/parent/me` (PATCH sets SMS or WhatsApp) | parent |
| GET | `/parent/messages`, `/parent/children/:id/results[/:termId]`, `/attendance`, `/invoices` | parent |
| POST, GET | `/parent/invoices/:id/pay`, `/parent/payments/:reference/verify` | parent |
| POST | `/student/auth/login` | anyone |
| GET, POST, PUT | `/student/me`, `/student/tests`, `/student/tests/:id/start`, `/student/attempts/:id[/answers, /submit]` | student |
| GET, POST | `/student/prep/plan`, `/student/prep/practice`, `/student/prep/explain/:questionId`, `/student/results[/:termId]` | student |
| GET, POST, PATCH, DELETE | `/kb/documents`, `/kb/documents/:id[/file, /reprocess]` (upload is a raw body with metadata in the query string) | staff; uploader or leadership to change |
| POST | `/kb/ask` | staff |
| GET, POST | `/student/tutor/topics`, `/student/tutor/conversations[/:id]`, `/student/tutor/conversations/:id/messages`, `/student/tutor/messages/:id/quiz` | student |
| GET, PUT, POST | `/student/exams`, `/student/exams/goal`, `/student/exams/topics`, `/student/exams/plan`, `/student/exams/mock` | student |
| GET, POST, PUT, PATCH, DELETE | `/assistant/context`, `/assistant/lesson`, `/assistant/assessment`, `/assistant/save`, `/assistant/essays[/:id[/scripts/:studentId, /push-scores]]`, `/assistant/remarks`, `/assistant/watchlist` | staff who teach the class and subject; leadership |
| GET | `/ai/overview`, `/ai/flags/:conversationId` | leadership |
| PATCH | `/platform/schools/:id/ai` (monthly AI allowance, daily student limit) | platform super admin |
| POST | `/platform/auth/login` | anyone |
| GET | `/platform/me`, `/platform/schools`, `/platform/admins` | platform super admin |

"Leadership" means the proprietor or an admin. Parent, student and platform tokens only work on `/parent/...`, `/student/...` and `/platform/...` routes. The `platform_admins` table (migration 0005) is outside row-level security and the `school_app` role cannot read it. Money is always in kobo (₦1 = 100 kobo), as Paystack uses.

## Keys and sandbox mode

Copy `apps/api/.env.example`. Everything runs without keys: messages are logged instead of sent, and online payment and AI answer "not set up yet". While messages are only logged and `NODE_ENV` is not `production`, the parent login code comes back in the API response (`devCode`) so you can sign in without a phone.

- **Paystack**: put a test secret key (`sk_test_...`) in `PAYSTACK_SECRET_KEY` and set the webhook URL in the Paystack dashboard to `<api>/api/webhooks/paystack`. Each school connects its bank account once (`POST /fees/paystack/subaccount`), so fees settle straight to the school.
- **Termii**: `TERMII_API_KEY`, an approved `TERMII_SENDER_ID`, and your account's `TERMII_BASE_URL`. WhatsApp needs a WhatsApp sender set up in Termii.
- **Claude**: `ANTHROPIC_API_KEY`. Every AI call is logged in `ai_usage` (tokens and cost per school, student and feature), limited per student per day and by each school's monthly allowance. `AI_TUTOR_MODEL` picks a different model for the tutor chat. `KB_MAX_UPLOAD_MB` caps knowledge base uploads (15 MB), and `USD_NGN_RATE` converts the AI allowance to naira on screen.

## Next

1. Printing a whole class's report cards at once.
2. Timetable (the screens show "coming next") and admissions.
4. Charging schools from the super admin billing page, and a shared question bank across schools.
3. Offline CBT for exam halls with poor internet.
