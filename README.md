# DRL Lending Cooperative

Admin system for a daily-collection microlending business, plus a public landing page.

- **Landing page** — public marketing page with a live "estimate your daily payment" calculator.
- **Admin app** — members, loans, daily collections, risk review, reports. Single admin account.
- **Stack** — React + Vite, Tailwind CSS v4, Supabase (Postgres + Auth), Recharts, jsPDF, write-excel-file.

## Business rules

| Rule | Value | Where to change |
| --- | --- | --- |
| Interest | 20% flat on principal, charged once | Settings page |
| Term | 40 days, daily collection (editable per loan) | Settings page / per loan |
| Late penalty | One-time 10% of the balance still open after the due date | Settings page |
| Write-off flag | Loans 90+ days past the due date | Settings page |
| Net income | Gross income (interest + penalties collected) − confirmed bad debt | — |

A loan is carried as a running balance, not a fixed day-by-day schedule. A member can pay any
amount, as many times in a day as they like — each collection simply comes off what is owed. Every
payment is split into principal and interest in the same proportion as the loan itself, so you can
always see how much of a collection was your money back and how much was earnings.

The daily figure (total payable ÷ term) is still shown as the target, and "behind schedule" still
means the same thing — days elapsed × the daily figure, less what has actually come in. It is just
worked out on the fly instead of being stored one row per day.

Because interest is only counted as income when it is actually collected, a write-off deducts the
**unrecovered principal** from net income — not the uncollected interest, which was never counted
as income in the first place.

## Setup

### 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of `supabase/migrations/0001_init.sql`.
3. Optional: run `supabase/seed.sql` to fill the books with ~150 demo members and their payment
   history, so you can see the dashboard with realistic numbers before entering real data.

### 2. Create your admin login

1. **Authentication → Users → Add user**: create your email and password.
2. **Authentication → Providers → Email**: turn **off** "Allow new users to sign up". Without this,
   anyone could create an account.
3. Back in the SQL Editor, put yourself on the admin list:

   ```sql
   insert into admin_users (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```

Nothing in the database is readable until a user id is in `admin_users` — row level security checks
it on every table, so even a leaked anon key returns nothing.

### 3. Point the app at your project

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**.

### 4. Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Restart the dev server after editing `.env.local`.

## Before going live

- Turn on 2FA (Supabase Auth → MFA) — worth it once real money is being tracked.
- Consider Supabase Pro for point-in-time recovery. The free tier keeps daily backups for 7 days.
- Change the `CRAFTED_BY` and `CRAFTED_BY_URL` constants at the top of `src/pages/Landing.jsx` to
  your own name and portfolio link.
- Update the office address, hours and loan range in the contact section of `src/pages/Landing.jsx`.
- `npm run build` produces `dist/`, deployable to any static host (Vercel, Netlify, Cloudflare
  Pages). Configure the host to serve `index.html` for unknown paths so client-side routes work.

## How the money logic is organised

All balance arithmetic lives in Postgres functions rather than in the browser, so recording a
payment is a single atomic transaction and the books cannot end up half-written:

| Function | Purpose |
| --- | --- |
| `create_loan` | Creates the loan and its full daily schedule in one transaction |
| `record_payment` | Applies a collection oldest-day-first and returns the principal/interest split |
| `update_payment` / `delete_payment` | Edits the record, then replays the loan's whole payment history so no drift accumulates. Both write to `payment_audit` |
| `apply_due_penalties` | Adds the one-time late penalty to loans past their due date |
| `flag_write_off_candidates` | Flags long-overdue loans for review |
| `confirm_write_off` | Records the loss and closes the loan |
| `dashboard_kpis` / `period_stats` / `income_series` | Aggregate reporting, computed in SQL |

`run_maintenance()` wraps the penalty and flagging passes; the dashboard calls it on load, so no
scheduler is needed.

Dates are anchored to `Asia/Manila` on both sides (`biz_today()` in SQL, `todayISO()` in JS).
Postgres runs in UTC on Supabase, so using `current_date` would have put the first eight hours of
every collection day on the previous date.
