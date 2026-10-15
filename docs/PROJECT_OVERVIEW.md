# HostelBuddy: project overview (for reviewers)

## Problem and solution
Manual hostel registers cause paperwork, allocation errors, slow complaint handling and weak visitor/outpass control.
HostelBuddy digitises these workflows for three roles: **Student**, **Warden** (one block) and **Admin** (all blocks).

## Modules (abstract → implemented)
| Abstract item | Implemented |
|---|---|
| Secure authentication | httpOnly session cookie, bcrypt, lockout, forced first-login password change, password reset by e-mailed link, session revocation |
| Student management | add/search/deactivate students, set-password invitation |
| Room allocation | rooms & beds, rule-checked allocation (gender + year per block), transfer, check-out, history, CSV export |
| Complaint management | submit, track, respond, status workflow, notifications |
| Visitor management | request, approve/reject/complete, student cancel |
| Announcements | hostel-wide or per-block notices + in-app and e-mail notifications |
| Extra: Outpass | request → approve → **gate code** → departed → returned, automatic overdue detection, progress tracker |
| Extra: Parent portal | guardian records with warden verification |
| Extra: Audit | login, allocation, decision and export events logged |

## Architecture
```
Browser (React + Vite)  ──HTTPS──>  Express API  ──TLS──>  MySQL 8
   served by the same container        helmet, CSRF header, rate limits, role scoping, validation
```
One Docker image builds the website and serves it with the API (`Dockerfile`); `render.yaml` deploys it free on Render with a free Aiven MySQL.

## Engineering quality
* Row-level access control on every query (student → own rows, warden → own block, admin → all).
* State machines for outpasses and visitor requests; transactions with row locks for allocations.
* Versioned SQL migrations with checksums; demo data kept separate and refused in production.
* 25 automated backend tests (validators, status flows, gender-correct data, config safety, TLS options).
* UI verified in a real browser at 360, 390, 820 and 1366 px: no horizontal overflow, no text below 12 px, no contrast failures, sign-out always reaches login.

## 5-minute demo script
1. **Splash + login** → sign in as admin (`docs/DEMO_ACCOUNTS.md`).
2. **Overview**: occupancy donut, pending approvals. **Students**: search a student, see room and bed.
3. **Rooms & beds → Allocate**: the picker only offers eligible beds (try a boy in a girls' block: impossible by design). **Allocations → Move** a student.
4. Switch to a **student** (menu → Sign out): see own room, **Outpasses → New outpass**, **Complaints → New complaint**, **Visitors**, **My profile**.
5. Back as **warden** (same block): **Approve** the outpass → student gets a **gate code**.
6. **Outpasses → Gate check**: enter the code → *Mark departed* → *Mark returned*. Show the progress steps.
7. **Notifications** and **Notices**; resize the browser to show the mobile card layout.
