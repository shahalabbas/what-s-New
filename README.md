# What's Next 📱

> Campus companion PWA for **IIM Udaipur** students (DEM 2026 batch) — live timetable, mess menu, project deadlines, and peer interview experiences.

---

## Features

- 🏠 **Smart Dashboard** — Two primary Apple-style widgets for **Class Now & Next** (with live progress & gap countdowns) and **Food Now & Next** (with post-dinner breakfast rollover).
- 📅 **Dated Timetable & Sessions** — Dated `class_sessions` with override statuses (scheduled, cancelled, rescheduled) and live session tracking.
- 🍽 **Mess Menu** — Four meal sections per day with full ingredient pills and active meal detection.
- 📁 **Projects & Assignments** — Filter by type, deadline countdowns, and detail sheet.
- 💼 **Interviews** — Searchable peer experiences, case questions, and anonymous posting.
- 📥 **Inbox & Email Ingestion** — Rule-based email extraction for notices, assignments, placement PPTs, and meetings with 1-click approval.
- 📊 **Excel / CSV Ingestion Pipeline** — Browser-side SheetJS parser supporting tabular layouts, grid layouts with merged duration cells, fuzzy course matching, and visual diff reviews.
- 🔄 **1-Click Batch Rollback** — Atomic transactional snapshots in PostgreSQL to restore previous schedule and mess states.
- 🔒 **Free-Tier Auth Gate** — Server-side `@iimu.ac.in` domain and cohort check via `BEFORE INSERT ON auth.users` trigger.
- 📲 **PWA** — Installs natively on iOS & Android with Workbox offline caching.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ALLOWED_EMAIL_DOMAIN=iimu.ac.in
VITE_FEATURE_ASK=false
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) or access from your phone at `http://<your-local-ip>:5173`.

---

## Supabase Setup Guide (Free Plan Compatible)

### Step 1: Run Database Migrations

In your **Supabase Dashboard → SQL Editor → New query**, run these migrations in order:

1. `supabase/migrations/0001_schema.sql` (Base tables & schema)
2. `supabase/migrations/0002_seed.sql` (IIM Udaipur seed data)
3. `supabase/migrations/0003_auth_cohort_access.sql` (Strict cohort access control and cohort-scoped RLS)
4. `supabase/migrations/0004_ingestion_and_dated_sessions.sql` (Free-plan auth trigger, `class_sessions`, `ingest_batches`, `ingest_items`, `events`, transactional apply & rollback functions)

> **Free Plan Auth Gate Note:** Supabase Free plan does not support external Auth Hooks. Migration 0004 installs a PostgreSQL `BEFORE INSERT ON auth.users` trigger (`validate_user_signup`) that enforces domain, regex, and cohort rules directly inside Postgres on the free tier.

---

### Step 2: Google Cloud Console Setup

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Configure your **OAuth Consent Screen**:
   - User Type: **External** (or Internal if Google Workspace allows).
   - App Name: `What's Next`
   - User support & developer contact emails.
3. Create **OAuth Client ID**:
   - Application type: **Web application**
   - Name: `Whats Next Web Client`
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `http://192.168.12.42:5173` (your local IP for mobile testing)
     - `https://your-app.vercel.app`
   - **Authorized redirect URIs**:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy your **Client ID** and **Client Secret**.

---

### Step 3: Configure Supabase Authentication

1. In Supabase Dashboard → **Authentication → Providers → Google**:
   - Enable Google.
   - Paste **Client ID** and **Client Secret**.
   - Save.

2. In Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `https://your-app.vercel.app` (or `http://localhost:5173` for local dev)
   - **Redirect URLs** (Add all):
     - `http://localhost:5173`
     - `http://localhost:5173/**`
     - `http://192.168.12.42:5173`
     - `http://192.168.12.42:5173/**`
     - `https://your-app.vercel.app`
     - `https://your-app.vercel.app/**`

---

## Data Ingestion Pipeline & Admin Tools

### 1. Excel / CSV Timetable Ingestion
- Supports **Tabular Layout** (`Date`, `Start Time`, `End Time`, `Course`, `Faculty`, `Room`, `Type`).
- Supports **Grid Layout with Merged Cells** (Date/Day rows × Time slot columns; handles cells merged across multiple time slots for extended durations).
- **Fuzzy Course Matching**: Intelligently maps strings like `"MKT 501 - Marketing"` or `"Marketing Management"` to the `courses` catalog and highlights unmatched course codes.
- **Overlap Validation**: Verifies that no two classes for the cohort overlap in time on the same date.
- **Visual Diff Preview**: Shows added, modified (with specific changed attributes), removed, and unchanged sessions prior to applying.
- Downloadable starter templates directly from the Admin screen.

### 2. Mess Menu Ingestion
- Upload weekly mess menu spreadsheets.
- Automatically cleans dish items and assigns default meal slots in IST.
- Compares against existing menus and displays staged diff counts.

### 3. Email Ingestion (Inbox)
- **Deterministic Rule Extraction** (No AI/LLM/RAG needed):
  - Classifies items into `assignment`, `project`, `placement_event`, `meeting`, `notice`.
  - Extracts dates and times in IST (handles relative phrases like "tomorrow", "this Friday", "by 11:59 PM").
  - Extracts Google Forms / MS Teams links, campus venues (`LH-1`, `Auditorium`, `CR-1`), and recruiter companies (`McKinsey`, `Deloitte`, `HUL`).
  - Pre-fills forms with an approval modal before publishing to students.
- **Manual Ingest**: Paste email text or upload `.eml` files.
- **Automated Gmail Sync**: Use `/scripts/gmail-apps-script.js` with Google Apps Script to poll emails with label `WhatsNext` and push to Supabase Edge Function `ingest-email`.

### 4. 1-Click Batch Rollback
- Every applied timetable or mess batch saves a pre-update snapshot of deleted rows.
- Click **"Rollback 🔄"** on the Rollback tab in Admin to restore the exact previous timetable state atomically.

---

## Cohort & Admin Management

All cohort access rules live entirely in PostgreSQL and can be updated instantly with SQL queries without rebuilding code:

### 1. Add / Remove Administrators

```sql
INSERT INTO public.admin_emails (email)
VALUES ('new.admin.dem2026@iimu.ac.in')
ON CONFLICT (email) DO NOTHING;
```

### 2. Enable Another Cohort (Zero Code Changes)

```sql
INSERT INTO public.allowed_cohorts (program, batch_year, display_name, is_active)
VALUES ('pgp', 2026, 'PGP 2026', true)
ON CONFLICT (program, batch_year) DO UPDATE
SET is_active = true;
```

---

## Running Unit Tests

```bash
npm test
```

Runs the 45 unit tests covering:
- IIMU email parsing & regex pattern matching (`authUtils.test.ts`)
- Tabular & Grid Excel parsing, merged cells, overlaps, fuzzy matching & diffs (`excelParser.test.ts`)
- Deterministic email rule classification, IST time extractors & fixtures (`emailParser.test.ts`)
- Schedule engine dated sessions & countdown formatting (`scheduleEngine.test.ts`)

---

## Deploy to Vercel

```bash
vercel
```

Set environment variables in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ALLOWED_EMAIL_DOMAIN=iimu.ac.in`
