# Demo accounts

Run `npm run demo:setup` in `backend/` once (see README). It creates these accounts, allocates beds and adds sample data.
All 808 accounts are listed in `credentials/demo-login-credentials.csv`.

**Passwords (demo only; the script refuses production):**
admins `Admin@Demo2026` · wardens `Warden@Demo2026` · students `Student@Demo2026`

## Admins and wardens (names match gender)
| Role | Name | Gender | Email | Block |
|---|---|---|---|---|
| Admin | Kavitha Sharma | Female | admin.female@example.test | All |
| Admin | Venkatesh Murthy | Male | admin.male@example.test | All |
| Warden | Anitha Kulkarni | Female | warden.a@example.test | A |
| Warden | Padmavathi Naidu | Female | warden.b@example.test | B |
| Warden | Jayasree Menon | Female | warden.c@example.test | C |
| Warden | Vasantha Rao | Female | warden.d@example.test | D |
| Warden | Ravindra Prasad | Male | warden.e@example.test | E |
| Warden | Satyanarayana Varma | Male | warden.f@example.test | F |

## Sample students (two per block; blocks A-D are girls, E-F are boys)
| Block | Name | Gender | Email | Room / Bed |
|---|---|---|---|---|
| A | Deepika Reddy | Girl | hb-g1-001@students.example.test | A101 / 1 |
| A | Lakshmi Sharma | Girl | hb-g1-002@students.example.test | A101 / 2 |
| B | Deepika Nayak | Girl | hb-g2-001@students.example.test | B101 / 1 |
| B | Lakshmi Rao | Girl | hb-g2-002@students.example.test | B101 / 2 |
| C | Deepika Raju | Girl | hb-g3-001@students.example.test | C101 / 1 |
| C | Lakshmi Verma | Girl | hb-g3-002@students.example.test | C101 / 2 |
| D | Deepika Menon | Girl | hb-g4-001@students.example.test | D101 / 1 |
| D | Lakshmi Pillai | Girl | hb-g4-002@students.example.test | D101 / 2 |
| E | Aarav Reddy | Boy | hb-b1-001@students.example.test | E101 / 1 |
| E | Karthik Sharma | Boy | hb-b1-002@students.example.test | E101 / 2 |
| F | Aarav Raju | Boy | hb-b3-001@students.example.test | F101 / 1 |
| F | Karthik Verma | Boy | hb-b3-002@students.example.test | F101 / 2 |

## What the sample data contains
Students in all six blocks with beds allocated, notices (hostel-wide and per block), complaints in every status,
parent/guardian records, visitor requests, outpasses (pending, approved, out, returned, overdue, rejected) with gate codes
for approved ones, and notifications for every kind of user. Re-running `npm run demo:setup` resets this sample activity.
