# Free deployment guide (GitHub → Aiven MySQL → Render)

Everything below is free and needs no credit card as far as the providers' own pages state; check their sign-up screens as plans can change.
You will create: **a GitHub repository** (your code), **a free MySQL 8 database on Aiven**, and **a free web service on Render** that runs the API and the website together.

> Free-tier facts to know: a free Render service **sleeps after 15 minutes without visitors and takes about a minute to wake**; Aiven's free MySQL has **1 GB** storage and may be powered off if completely unused (you can switch it back on).
> For a mentor demo: open your site 2 minutes before presenting.

## Part 1: Push the project to GitHub
1. Install Git (git-scm.com) and create a free account at github.com.
2. On github.com click **+ → New repository**. Name it `hostelbuddy`. Leave "Add README/.gitignore" **unticked**. Click **Create repository**.
3. In VS Code open the project folder, open the terminal (`` Ctrl+` ``) in the **project root** (the folder containing `backend`, `frontend`, `Dockerfile`) and run:
```
git init
git add .
git status
```
   Check the list: you must **not** see `.env`, `node_modules`, `credentials/` or any `.pem` file (they are git-ignored). Verify with `git check-ignore -v backend/.env`.
```
git commit -m "HostelBuddy: first commit"
git branch -M main
git remote add origin https://github.com/<your-username>/hostelbuddy.git
git push -u origin main
```
4. A browser window asks you to sign in to GitHub the first time. If it asks for a password in the terminal, use a **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) instead of your password.
5. Refresh the repository page: you should see your files. Later changes: `git add . && git commit -m "message" && git push`.
6. Commit the `package-lock.json` files created by `npm install` (they should appear in `git status`; do not ignore them).

## Part 2: Create the free MySQL database (Aiven)
1. Sign up at aiven.io (no payment details needed for the free plan).
2. **Create service → MySQL → Free plan**, give it a name, create it, and wait until it shows **Running**.
3. On the service **Overview** page note: **Host, Port, User (avnadmin), Password, Database name (defaultdb)**. Download the **CA certificate** (`ca.pem`).
4. If the page has an **Allowed IP addresses** setting, make sure it allows `0.0.0.0/0` (Render's free servers have no fixed IP).
5. Put `ca.pem` inside your `backend/` folder (it is git-ignored).

## Part 3: Load the tables and demo data into that database (from your computer)
1. In `backend/` create a file named `.env.remote` (also git-ignored):
```
DB_HOST=<aiven host>
DB_PORT=<aiven port>
DB_USER=avnadmin
DB_PASSWORD=<aiven password>
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_CA=./ca.pem
JWT_SECRET=any-long-random-text-at-least-32-characters-long
```
2. Run (from `backend/`):
   - **Windows PowerShell:** `$env:DOTENV_CONFIG_PATH=".env.remote"; npm run demo:setup -- --allow-remote`
   - **Windows CMD:** `set DOTENV_CONFIG_PATH=.env.remote` then `npm run demo:setup -- --allow-remote`
   - **Mac/Linux:** `DOTENV_CONFIG_PATH=.env.remote npm run demo:setup -- --allow-remote`
3. It prints steps 1/5 … 5/5. This creates the tables, 800 students with beds, every demo login and sample activity (accounts: `docs/DEMO_ACCOUNTS.md`).
   *Want a clean, real system instead of the demo?* Run `npm run db:migrate` and then `npm run create-admin -- --email=you@college.edu --name="Your Name"` with the same `DOTENV_CONFIG_PATH`.
4. Demo passwords are public in this repository's docs. That is fine for a college demo; before real use wipe the data (`npm run db:reset-dev`) and create a real admin.

## Part 4: Deploy on Render
1. Sign up at render.com with your GitHub account.
2. **New + → Blueprint**, pick your `hostelbuddy` repository. Render reads `render.yaml` and proposes one free web service.
3. Fill the values it asks for:

| Variable | Value |
|---|---|
| `DB_HOST` | Aiven host |
| `DB_USER` | `avnadmin` |
| `DB_PASSWORD` | Aiven password |
| `DB_NAME` | `defaultdb` |
| `DB_SSL_CA_BASE64` | the base64 text of `ca.pem` (below) |

   Base64 of the certificate: **PowerShell** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("backend\ca.pem"))` · **Mac/Linux** `base64 -w0 backend/ca.pem` (macOS: `base64 -i backend/ca.pem`). Paste the single long line.
   `JWT_SECRET` is generated automatically. The public URL is detected automatically (`RENDER_EXTERNAL_URL`); set `APP_URL` yourself only if you add a custom domain.
4. Click **Apply / Create**. The first build takes a few minutes. The log should end with `HostelBuddy API listening`.
5. Open `https://<your-service>.onrender.com/api/health` → `{"status":"ok"}` and `/api/health/ready` → `{"status":"ready"}`. Then open the site root and sign in.

If the database connection fails with a certificate error, set `DB_SSL_INSECURE` to `true` in Render's **Environment** tab (still encrypted, but the certificate is not verified) and redeploy.

## Part 5: Updating and troubleshooting
* Every `git push` to `main` redeploys automatically.
* **Site takes ~1 minute on first visit** → the free service was asleep. Optional: a free monitor such as UptimeRobot pinging `/api/health` every 5 minutes keeps it awake (one service fits inside Render's 750 free hours/month).
* **Logs:** Render → your service → **Logs**. Common messages:

| Message | Fix |
|---|---|
| `Unsafe production configuration: DB_USER must not be root` | use `avnadmin` (or another non-root user) |
| `Cannot connect to MySQL … ETIMEDOUT/ECONNREFUSED` | wrong host/port, database powered off, or IP allow-list blocks Render |
| `self-signed certificate in certificate chain` | wrong/missing `DB_SSL_CA_BASE64`, or use `DB_SSL_INSECURE=true` |
| `Access denied for user` | password mismatch |
| `Database is not up to date` | run Part 3 step 2 again (the container also applies migrations on start) |
| Login works but you are bounced back to login | open the site over `https://` only, not `http://` |
