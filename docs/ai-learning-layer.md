# AI learning layer

The AI side of Linx School, for Nigerian schools from nursery to SS 3, starting with GCIS Abuja.
It is built in four phases. Phase 1 is in this repository; the rest is the plan.

The AI is Claude, through the Anthropic API. Everything works without a key: each feature has a
stand-in that uses the school's own notes and question bank, so a school can be shown the product
(and students can practise) before AI is switched on. Setting `ANTHROPIC_API_KEY` turns the AI on;
nothing else changes.

## Phase 1 (built): knowledge base, student tutor, exam prep, guardrails

### School knowledge base

- Teachers and admins upload schemes of work, lesson notes, past questions, marking schemes,
  textbook extracts and other material, tagged by subject, class level and term
  (`Teacher` and `Admin` portals, **Knowledge Base**).
- PDF (text pages), Word (.docx) and plain text are read straight away. Photos and scanned PDFs
  are stored and marked "waiting for AI"; once a key is set they are transcribed by Claude, and
  "Read again" reprocesses any document.
- Text is split into passages of about 1,100 characters. "Week N" headings and PDF pages become
  the citation ("Ohm's law (lesson note) · Week 2"). Search is Postgres full-text search with
  ranking boosts for the student's own class and term, so it needs no extra service.
- A scheme of work is also read as an outline (week → topic). Revision, test and exam weeks are
  skipped. The outline drives tutor topics, exam-prep topic lists and the study plan.
- Marking schemes are staff-only by default. Any document can be hidden from students.
- **Ask your material**: staff can ask a question and see the passages (and, with AI on, the
  answer) the tutor would use.

### Student AI tutor

- A chat per subject and topic (`Student` portal, **AI Tutor**), with buttons for Explain,
  Worked example, Quiz me and Hint, plus free typing.
- Claude is told the student's class level, the subject, the topic, the school's scheme of work
  for that class and term, and the best matching passages from the knowledge base. It answers from
  the school's material first and cites it as [1], [2]; general knowledge is labelled as such.
- It follows the Nigerian curriculum (NERDC, WAEC/NECO/JAMB syllabuses), uses Nigerian examples
  and naira, and pitches language to the class (simpler for JSS, exam technique for SS 3).
- **Guides, does not do the work**: when a message looks like homework or an assignment, the tutor
  gives the method, a similar worked example and a hint, and asks the student to try the next step.
- Quizzes are multiple choice, marked in the chat with an explanation. Quiz answers count towards
  the student's topic accuracy in exam prep.
- Without a key the tutor is in practice mode: it quotes the school's notes with citations, sets
  questions from the school's bank and shows worked examples from it.

### Exam prep: WAEC, NECO, JAMB (UTME), BECE

- Exams offered by section: SS students see JAMB UTME, WAEC (WASSCE) and NECO (SSCE); JSS students
  see BECE.
- Each student sets a goal per exam: subjects (JAMB is four, with Use of English compulsory) and
  the exam date (defaults to the next sitting after the student's final year).
- **Timed mock exams**, JAMB style: all subjects in one sitting with subject tabs, a single clock
  (full UTME: 180 questions in 120 minutes), autosave, and automatic submission when time runs out.
  A short mock keeps the real pace with a quarter of the questions, for students on mobile data.
- **Marking with explanations**: per-subject scores, a WAEC grade per subject, a UTME score out of
  400, and the explanation under every question; "Explain step by step" asks Claude for more.
- **Weak-topic tracking** from mocks, practice sets, CBT tests and tutor quizzes, shown per topic
  with "Practise" and "Ask the tutor" for each.
- **Predicted readiness** per student: a JAMB score out of 400, or likely WAEC/NECO credits, from
  recent mocks, school results and practice, with a band (on track, borderline, at risk) and a
  confidence level. It says it is a guide, not a promise.
- **Personal study plan up to exam day**: week by week, weakest topics first, then the rest of the
  scheme of work, a timed mock every third week and in the last week, and revision at the end.

### Guardrails

- **Role-based access**: students see only student-visible material and their own chats and
  attempts; teachers and admins manage the knowledge base; only leadership sees AI usage and safety
  flags. All new tables sit under the existing Postgres row-level security per school.
- **Safe content for children**: every student message is screened before it reaches the AI.
  Messages about harm, abuse or self-harm get a caring reply pointing to a trusted adult (and 112),
  are never sent to the AI, and are flagged for the proprietor and admin on **AI Usage & Safety**
  with the full chat. Inappropriate requests are declined. Phone numbers and emails are removed
  before anything is stored or sent. The tutor's instructions keep it on schoolwork and age
  appropriate.
- **Cost limits per school**: a monthly AI allowance per school (default $100, shown in naira),
  checked before every call; AI pauses when it is used up and students fall back to practice
  mode. Each student also has a daily limit of AI replies. Every call is logged with its tokens and
  cost by feature. The Linx team sets a school's allowance with
  `PATCH /api/platform/schools/:id/ai`.
- **Slow mobile data**: short replies by default, short mocks, answers saved as they are given,
  history trimmed to the last 10 messages, the AI's work done on the server, and no large
  downloads in the student screens.

### Demo data (GCIS demo school)

`pnpm db:seed` adds, on top of the existing demo: about 90 exam-style questions (JAMB, WAEC, NECO and
BECE style, written for the demo), schemes of work for SS 2 Physics, Mathematics and Chemistry,
SS 3 English and JSS 3 Basic Science for all three terms, lesson notes, a textbook PDF, revision
questions, a marking scheme and a photo waiting for AI; JAMB and WAEC goals and two mocks for
Chiamaka Okafor (SS 2, `GCIS/S/001`), tutor chats, a safeguarding flag from an SS 3 student
(`GCIS/T/001`), and a BECE goal for a JSS 3 student (`GCIS/J/001`). Student PIN: `123456`.

## Phase 2 (built): teacher assistant

Teachers open **Teaching Assistant** in the teacher portal, pick one of their classes and subjects,
and get five tabs. Every route checks that the teacher teaches that subject in that class
(leadership can use any class).

### Lesson notes and plans
- Pick a week of the scheme of work (or type a topic). The draft follows the school's own scheme,
  notes and textbook extracts, and cites them. Drafts never quote earlier saved plans, past
  questions or marking schemes.
- Edit, then save back into the knowledge base: a lesson note (students can see it) or a lesson
  plan (staff only, new `lesson_plan` kind).
- Without a key: a fill-in template built from the scheme of work and the school's notes.

### Tests and exams
- Pick a topic, the number of objective and theory questions, and the difficulty. Questions come
  from the school's question bank first; Claude writes the rest with a marking scheme for theory.
- Save new objective questions to the question bank, the paper to the knowledge base (staff only),
  and the marking scheme. A theory question opens straight into marking with its rubric.
- Without a key: only bank questions, and the screen says so.

### Mark answers
- An essay task holds the question, the rubric (typed as lines such as "Correct formula (2)"), the
  term and the score column it feeds (for example 2nd CA). Tables `essay_tasks` and
  `essay_scripts` (migration 0008, row-level security).
- Type or paste each student's answer. Claude suggests marks per rubric point with a reason;
  without a key, a keyword match does it, and a point with a wrong or missing number scores 0.
- The teacher confirms every mark (and can change it). Only confirmed marks are pushed to the score
  sheet, scaled to the column's maximum.

### Report remarks
- Drafts a teacher's remark (and a head's remark for leadership) for every student in the class at
  once, from best and weakest subject, position and the trend since last term. Teachers edit, then
  save one or all; they appear on the report cards.
- Refuses to draft until at least 80% of score rows have every column, so remarks are not written
  from CA scores alone. The screen offers the previous term instead.
- Without a key: varied template remarks from the same facts.

### Students to watch
- For the class's current term: average so far against last term (a drop of 10 or more points),
  subjects below the pass line (50 in senior secondary, 40 below), attendance under 85%, missed CBT
  tests, low exam readiness and no practice or tutor activity in 14 days.
- Urgent when there are two serious reasons or three or more failing subjects; "watch" otherwise.

### Demo data
`pnpm db:seed` adds, for Mr. Bakare (`teacher@demo.test`, SS 2 Gold Mathematics): a saved
"Logarithms" lesson plan and the essay task "Logarithms theory (2nd CA)" with four answers, two
already confirmed.

### API
| Method | Route |
| --- | --- |
| GET | `/assistant/context?classId&subjectId` |
| POST | `/assistant/lesson`, `/assistant/assessment`, `/assistant/save` |
| GET, POST | `/assistant/essays` |
| GET, DELETE | `/assistant/essays/:id` |
| PUT, PATCH | `/assistant/essays/:id/scripts/:studentId` (PUT enters an answer and suggests marks, PATCH confirms) |
| POST | `/assistant/essays/:id/push-scores`, `/assistant/remarks` |
| GET | `/assistant/watchlist?classId` |

## Phase 3: insights

- Teacher: class progress by topic, who is falling behind, and which topics to reteach.
- Parent: each child's readiness and weak topics in plain language, with what to do at home.
- Proprietor: readiness by class and subject, WAEC/BECE projections, teacher and subject
  comparisons, and AI usage against outcomes.
- Predicted exam readiness for each class, not only each student.

## Phase 4: hardening and scale

- Embedding search (pgvector) beside full-text search, for questions worded differently from the
  notes.
- Background jobs for transcription and large uploads; streaming tutor replies.
- An offline-capable student app (PWA) that caches notes and practice questions.
- A Linx-wide shared question bank and curriculum outlines schools can start from.
- Platform screens for each school's AI allowance and usage.
