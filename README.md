# HostelBuddy — Hostel Management System

Smarter hostels. Happier students. React + Vite frontend, Node.js/Express API, MySQL 8 database.

**Modules:** secure authentication · student management · room & bed allocation · complaint management · visitor management ·
parent/guardian verification · **outpass issuing** · notices & announcements · in-app + e-mail notifications · allocation CSV export · audit log.

**Roles:** Student (own records only) · Warden (their block only) · Admin (hostel-wide).
Blocks: A–D girls (years 1–4), E boys years 1–2, F boys years 3–4 (enforced on allocation).

> Docs: `docs/DEPLOYMENT.md` (free GitHub + Aiven + Render guide) · `docs/PROJECT_OVERVIEW.md` (modules, architecture, demo script) · `docs/DEMO_ACCOUNTS.md` · `docs/CHANGES_AND_FIXES.md`.

## Requirements
Node.js **20.19+** (22 recommended) · MySQL **8.0+** (not MariaDB).

## 1. Local development
```bash
# 1) database + user (MySQL shell)
CREATE DATABASE hostelbuddy CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'hostelbuddy_app'@'localhost' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON hostelbuddy.* TO 'hostelbuddy_app'@'localhost';   -- dev only; see "Production" for least privilege

# 2) backend
cd backend
cp .env.example .env          # fill DB_PASSWORD and JWT_SECRET (instructions inside the file)
npm install
npm run demo:setup            # ONE command: migrates, loads 800 students + beds, creates every demo login,
                              # adds sample notices/complaints/visitors/outpasses/notifications, writes the CSV
npm run dev
# (for a real, empty system instead: npm run db:migrate && npm run create-admin -- --email=you@college.edu --name="Your Name")

# 3) frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (the dev server proxies /api to :5000)
```
**Demo accounts** (after `npm run demo:setup`, local databases only): see `docs/DEMO_ACCOUNTS.md` and `credentials/demo-login-credentials.csv`.
Quick start: `admin.female@example.test` / `Admin@Demo2026`, `warden.a@example.test` / `Warden@Demo2026`,
`hb-g1-005@students.example.test` / `Student@Demo2026`. Accounts you create with `create-admin` or the Students page must change their temporary password at first sign-in.
Signing out: avatar menu (top right) → **Sign out**, the **Sign out** button at the bottom of the sidebar, or **My profile**.
Upgrading from the old ZIP? Just run `npm run db:migrate` — existing tables are kept and the new columns/indexes are added.

## 2. Production
**Free hosting step by step: see `docs/DEPLOYMENT.md`** (GitHub → free Aiven MySQL → free Render web service, using `render.yaml`).

**Option A — Docker (simplest):**
```bash
cp .env.example .env      # set MYSQL_ROOT_PASSWORD, DB_PASSWORD, JWT_SECRET, APP_URL (https://…)
docker compose up -d --build
docker compose exec app node src/scripts/create-admin.js --email=you@college.edu --name="Your Name"
```
Put a TLS reverse proxy (Caddy, nginx, Cloudflare, or your host's HTTPS) in front of port 5000 and keep `TRUST_PROXY=1`.

**Option B — manual:** build the frontend (`cd frontend && npm ci && npm run build`), then in `backend/.env` set
`NODE_ENV=production`, `SERVE_FRONTEND=true`, `APP_URL=https://your-domain`, `TRUST_PROXY=1`, a strong `JWT_SECRET` and a non-root DB user,
run `npm ci --omit=dev && npm run db:migrate && npm start` under systemd/PM2.
The server refuses to start in production with a root DB user, empty DB password, weak secret or non-HTTPS `APP_URL`.

**Least-privilege DB users (recommended):**
```sql
CREATE USER 'hostelbuddy_app'@'%' IDENTIFIED BY '…';
GRANT SELECT, INSERT, UPDATE, DELETE ON hostelbuddy.* TO 'hostelbuddy_app'@'%';
CREATE USER 'hostelbuddy_migrate'@'%' IDENTIFIED BY '…';          -- put in MIGRATE_DB_USER / MIGRATE_DB_PASSWORD
GRANT ALL PRIVILEGES ON hostelbuddy.* TO 'hostelbuddy_migrate'@'%';
```
Also: enable MySQL backups, run the API on a private network, keep `package-lock.json` committed, and run `npm run audit` regularly.

## 3. Onboarding real students
Admin/warden → **Students → Add student**. A one-time set-password link is e-mailed (or shown to you if SMTP is not configured).
Then **Allocations → Allocate bed** (the picker only offers beds the student is eligible for).

## 4. Scripts
| Backend command | Purpose |
|---|---|
| `npm run db:migrate` | apply pending SQL migrations (tracked in `schema_migrations`) |
| `npm run demo:setup` | full local demo: data + logins + sample activity + CSV (refuses in production / remote DBs; safe to re-run) |
| `npm run create-admin -- --email= --name=` | create/re-provision an administrator |
| `npm run db:reset-dev` | wipe all tables (dev only) |
| `npm test` | unit tests |

## 5. Troubleshooting
* Dashboard shows no students/beds → you signed in with an account on an empty database. Run `npm run demo:setup`, then refresh.
* `Port 5000 is already in use` → another process owns it; stop it or set `PORT` (and `VITE_DEV_API` for the dev proxy).
* `Database is not up to date` → run `npm run db:migrate`.
* Stuck on login after deployment over HTTP → production cookies are `Secure`; use HTTPS (or, for a local trial only, `COOKIE_SECURE=false` + `ALLOW_INSECURE_HTTP=true`).
* Reset e-mails not arriving → configure `SMTP_*`; without SMTP the link is printed to the server log in development only.
* `npm audit` shows something → run `npm install` (to generate the lockfile), then `npm audit fix`; open an issue with the output if it persists.

## Project layout
```
backend/   Express API (src/routes, middleware, services, scripts) + unit tests
frontend/  React + Vite app (src/pages, components) — design tokens in src/styles.css
database/  migrations/ (schema), seeds/ (demo data), reset_dev.sql
docs/      DEPLOYMENT.md, PROJECT_OVERVIEW.md, DEMO_ACCOUNTS.md, CHANGES_AND_FIXES.md
render.yaml  one-click free Render blueprint
```
