# What was found and fixed

Everything below was found by reading the whole original ZIP (backend, frontend, SQL, scripts).

## Build-breaking / runtime bugs
| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | `frontend/src/App.jsx` line 8 | `{...old,Object.fromEntries(results)}` is a **syntax error** (missing `...`), so `vite build` / `npm run dev` could not compile | Frontend rewritten as readable modules; every file syntax-checked |
| 2 | `/api/auth/*` rate limiter | `/api/auth/me` (called on every page load) counted toward a 30-request/15-min cap, so normal users got locked out | Limits apply only to login / forgot / reset; separate generous API-wide limiter |
| 3 | Allocation form | UI sent the **room ID as the bed ID** and asked users to type raw bed IDs | Real bed picker, filtered by the student's gender and year |
| 4 | Admin notices | Admins saw only "ALL" notices (SQL `COALESCE` returned NULL) | Fixed audience query per role |
| 5 | Students list | Hard `LIMIT 500` silently hid 300 of 800 students | Limit raised + client pagination |
| 6 | Notices to everyone | One SELECT + optional SMTP send + INSERT **per user, inside the request** (800 users = minutes, timeouts) | Bulk INSERT; e-mails sent in background with a pooled transporter |
| 7 | Dates / time zones | DATETIME values were interpreted in server-local time and shown in browser time | All times stored/transferred as UTC; DATE columns stay plain strings |
| 8 | `app_users.username VARCHAR(60)` | Logins are e-mail addresses (up to 160 chars) | Widened in migration 003 |
| 9 | Block rules E/F | `academic_year` NULL meant **any** boy could be placed in block E or F | `min_year`/`max_year` per block, enforced on allocation |
| 10 | Outpass/visitor decisions | Any status could be set from any status (re-approve a returned outpass, etc.) | Explicit state machines + conditional UPDATE against concurrent edits |
| 11 | Staff forms | Visitor / outpass / parent forms for staff had no student field and always failed | Student selector added |
| 12 | Table layout | "Check out" column missing cells for non-active rows | Fixed |
| 13 | Overdue outpasses | Status existed but nothing ever set it | Background sweep every 5 min + notifications |
| 14 | `schema.sql` | Dropped core tables but not feature tables; re-running corrupted state; `USE hostelbuddy` hard-coded; 500 KB duplicate `base_seed_800.sql` | Tracked migrations (`npm run db:migrate`), separate demo seed, no destructive scripts in the normal path |
| 15 | Seed script | Overwrote real passwords on every run | Never overwrites an existing password |

## Security
| # | Problem | Fix |
|---|---------|-----|
| 1 | Demo passwords were `Welcome@<student code>` — **guessable by anyone who knows a student ID** — and 800 of them were committed in `credentials/*.csv` (not git-ignored) | Random one-time passwords, CSV git-ignored and `chmod 600`, seeding refuses in production, forced change at first login |
| 2 | Login page pre-filled with a real demo account | Removed |
| 3 | JWT stored in `localStorage` (stealable via any XSS) | httpOnly, Secure, SameSite cookie (`__Host-` prefixed in production) |
| 4 | No CSRF protection | SameSite + CORS allow-list + required `X-HB-CSRF` header on every state-changing call |
| 5 | No brute-force defence beyond a shared IP limit | 20 attempts/15 min/IP **and** account lockout (5 failures → 15 min) |
| 6 | Login timing revealed which e-mails exist | Constant-time bcrypt compare against a dummy hash; identical errors |
| 7 | Password reset: token e-mailed as raw text with no UI to use it; dev token logged; single use not atomic | Fragment-based link (`/#reset=…`), `FOR UPDATE` transaction, old tokens revoked, response sent before work (no timing leak) |
| 8 | Sessions survived password changes | `password_changed_at` revokes all earlier sessions |
| 9 | Weak password policy (length only; bcrypt silently truncates past 72 bytes) | 10–72 chars, letter+digit, must not contain name/e-mail/ID |
| 10 | `must_change_password` was never enforced | API refuses everything except change-password until it is done; UI forces it |
| 11 | IDOR: a student could attach **another student's guardian** to a visitor request | Ownership verified |
| 12 | Students could list all rooms/beds **with the names of other residents** | Rooms/beds are staff-only |
| 13 | No field-length validation (MySQL errors surfaced as 500s); LIKE wildcards unescaped | Central validators; `%`/`_` escaped; friendly 400/409 errors |
| 14 | CSV export vulnerable to spreadsheet formula injection (`=cmd…`) | Cells starting with `= + - @` are neutralised |
| 15 | Helmet defaults only; Vite dev server bound to `0.0.0.0` | Strict CSP, no-referrer, frame-ancestors none, dev server on localhost only |
| 16 | Production could start with root DB user / empty password / placeholder secret | Startup refuses unsafe production config |
| 17 | No audit trail although `audit_logs` table existed | Logins, password changes, allocations, decisions, exports etc. are logged |
| 18 | DB admin power mixed with app power | Migrations use optional separate `MIGRATE_DB_*` credentials; web server never enables `multipleStatements` |

## Dependencies
* `nodemailer` 6.x has published advisories → **^10.0.10**.
* `vite` 6.0.x (+ its bundled `esbuild`) has dev-server advisories → **vite ^8.1.3 / @vitejs/plugin-react ^6.0.3**.
* `@vitejs/plugin-react` moved to devDependencies; lockfiles are **no longer git-ignored**.

## Operations
Health (`/api/health`) and readiness (`/api/health/ready`) endpoints, graceful shutdown, fail-fast on DB/migration problems,
Dockerfile + compose, CI workflow, unit tests for validators.

---
# Update v4 (after first hands-on testing)

| Reported problem | Cause found | Fix |
|---|---|---|
| Dashboard empty: no beds, no students, nothing to view | An admin made with `create-admin` sits on an empty database; demo data was never loaded | `npm run demo:setup` loads 800 students, 200 rooms, 800 allocations **plus** notices, complaints, parent records, visitor requests, outpasses and notifications |
| Credentials CSV empty | `seed` overwrote the file with whatever it created *this* run, so a second run wrote an empty file | New script rewrites the full CSV from the database every time; a complete 808-row CSV also ships in `credentials/` |
| Cannot sign out / switch accounts | Sign out was a tiny icon at the very bottom of a fixed sidebar and was pushed off-screen on shorter windows; no menu on phones | Pinned labelled **Sign out** button, avatar menu in the top bar (all screen sizes), Sign out on the new **My profile** page; always returns to the login page with a notice |
| Cannot view profile | No profile page existed | New **My profile** page (details, room/block, last sign-in, change password) backed by `GET /api/auth/profile` |
| Small text / low contrast | 72 of 83 font sizes were under 12px; 40+ grey text colours were below WCAG AA | Minimum text size 12px; every text colour re-checked; verified in a real browser (0 failures) |
| Not fully responsive | Tables scrolled sideways on phones | Tables turn into stacked cards under 700px; menus/forms/modals checked at 360, 390, 820, 1366px |

**How this was verified (real Chromium, mocked API):** 5 screen sizes × all 11 pages × 3 roles — no horizontal overflow, no text under 12px,
no contrast failures, sign-out via menu / sidebar / expired session always reaches the login page, and the Sign out button stays visible on a 520px-tall window.
The SQL seed script itself could not be run in the build sandbox (no MySQL): it was reviewed column-by-column against the schema, so run `npm run demo:setup` and tell me if it prints an error.

---
# Update v5

| Request / finding | Fix |
|---|---|
| Boys' block showed girls' names; fathers had female names | Root cause: one list of girls' first names was used for all 800 students. New gender-aware name module: boys get boys' names, girls get girls' names, surnames are neutral, fathers/uncles/brothers get male names, mothers/aunts/sisters female names, wardens and admins named by gender. `demo:setup` also corrects an existing database. Unit-tested. |
| Loading animation too fast | Branded splash with progress bar and status messages, shown for about 3 seconds (0.9 s if the device asks for reduced motion) |
| Room transfer | One-step **Move** (old allocation ends, new starts, history kept, student notified) |
| Gate pass | Approved outpasses get an 8-character gate code; **Gate check** marks departed/returned; outpass progress tracker |
| Empty screens | Friendly empty states with an action button; loading skeletons |
| Accessibility/UX | Modal focus trap, time-zone hints on date fields, staff gender shown in profile |
| Deployment | `render.yaml`, Render URL auto-detected, TLS options for managed MySQL (`DB_SSL_CA`, `DB_SSL_CA_BASE64`), full free-hosting guide, GitHub steps |
| Tests | Backend tests grew from 9 to 25 (names, status flows, gate codes, config/TLS/production safety) |
