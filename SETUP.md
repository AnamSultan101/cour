# Cour Tracker — setup, step by step

Four phases, about 40 minutes total. Do them in order; each one depends on the
last. Every step has a **check** so you know it worked before moving on.

**Files you need**, all downloaded from the chat:

| File | Becomes |
|---|---|
| `cour-tracker-hosted.html` | `index.html` |
| `refresh.mjs` | `scripts/refresh.mjs` |
| `refresh.yml` | `.github/workflows/refresh.yml` |
| `cour-tracker-library.json` | pasted into the app later, never uploaded |

---

# Phase 1 — GitHub

## 1.1 Make an account
Go to **github.com** → Sign up. Free plan. Verify your email.

## 1.2 Make the repository
Top right **+** → **New repository**.

- Repository name: `cour`
- **Public** — this matters. Actions minutes are unlimited on public repos and
  metered on private ones. Nothing personal goes in here.
- Tick **Add a README file**
- **Create repository**

**Check:** you land on a page showing `README.md`.

## 1.3 Add the app
**Add file → Upload files**. Drag in `cour-tracker-hosted.html`.

Before committing, you can't rename in the upload screen, so commit it, then:
click the file → pencil icon → change the name at the top to `index.html` →
**Commit changes**.

*Or skip that*: **Add file → Create new file**, name it `index.html`, open
`cour-tracker-hosted.html` in Notepad, copy everything, paste, commit.

**Check:** repo root shows `index.html`.

## 1.4 Add the refresh script
**Add file → Create new file**. In the name box type:

```
scripts/refresh.mjs
```

Typing the `/` creates the folder. Open `refresh.mjs` in Notepad, copy all,
paste into the editor, **Commit changes**.

**Check:** repo shows a `scripts` folder.

## 1.5 Add the schedule
**Add file → Create new file**. Name it exactly:

```
.github/workflows/refresh.yml
```

Paste the contents of `refresh.yml`. Commit.

**Check:** an **Actions** tab appears at the top of the repo.

## 1.6 Let the job write back
**Settings** (repo settings, not your account) → **Actions** → **General** →
scroll to **Workflow permissions** → select **Read and write permissions** →
**Save**.

Without this the job runs but can't commit the data file.

## 1.7 Run it once by hand
**Actions** tab → **Refresh anime data** in the left list → **Run workflow**
button → **Run workflow**.

Wait 1–2 minutes, refresh the page. A green tick means success. Click into the
run to see the log — it prints how many shows it fetched.

**Check:** repo now has `data/anime.json`. Click it; it should be a wall of JSON
mentioning shows airing right now.

*Red X?* Open the run, read the failing step. Almost always 1.6 was skipped.

## 1.8 Publish the page
**Settings** → **Pages** (left sidebar) → under **Build and deployment**:

- Source: **Deploy from a branch**
- Branch: **main**, folder: **/ (root)**
- **Save**

Wait a minute or two. The page shows your URL at the top:

```
https://YOURNAME.github.io/cour/
```

**Check:** open it. Cour Tracker loads with an empty library.

---

# Phase 2 — Supabase

## 2.1 Make the project
**supabase.com** → Start your project → sign in with GitHub (simplest).

**New project**:
- Name: `cour`
- Database password: generate one and **save it somewhere** — you won't need it
  for the app, but you'll want it later
- Region: pick the closest to you
- **Create new project** — takes about two minutes to spin up

## 2.2 Create the table
Left sidebar → **SQL Editor** → **New query**. Paste this and press **Run**:

```sql
create table if not exists library (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table library enable row level security;

create policy "own row read"   on library for select using (auth.uid() = user_id);
create policy "own row write"  on library for insert with check (auth.uid() = user_id);
create policy "own row update" on library for update using (auth.uid() = user_id);
```

**Check:** "Success. No rows returned." Then **Table Editor** in the sidebar
shows a `library` table.

What those three policies do: every read and write is filtered to the row whose
`user_id` equals the logged-in user. Someone with your anon key and no password
gets nothing.

## 2.3 Turn off email confirmation
**Authentication** → **Sign In / Providers** → **Email** → switch off
**Confirm email** → Save.

Skip this and you'll have to click a link in your inbox before the first sign-in
works. Either is fine; off is faster.

## 2.4 Copy the two values
**Project Settings** (gear, bottom left) → **API keys** / **Data API**.

Copy:
- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ...`

**Do not copy the `service_role` key.** That one bypasses every policy. It has no
place in a browser, and this app never asks for it.

---

# Phase 3 — Wire it up

## 3.1 Open your page
Go to `https://YOURNAME.github.io/cour/` on your computer.

## 3.2 Restore your library
Open `cour-tracker-library.json` in Notepad → Ctrl+A → Ctrl+C.

In the app: **burger menu → Data & settings → Restore** → paste → **Restore**.

**Check:** 236 shows appear. This happened entirely in your browser — the file
never went to GitHub or Supabase.

## 3.3 Pull the anime data
**Burger menu → Refresh from AniList.**

It reads `data/anime.json` from your own repo — one request.

**Check:** covers appear, and Home shows an airing row and a weekday grid with
real dates in it.

## 3.4 Turn on cloud sync
**Burger menu → Cloud sync.**

- Project URL: paste from 2.4
- Anon public key: paste from 2.4
- Email and a password you choose
- **Create account**

**Check:** it says *Signed in as you@email*. In Supabase → Table Editor →
`library`, one row now exists with your user id.

---

# Phase 4 — Your phone

1. Open the same `https://YOURNAME.github.io/cour/` in your phone browser
2. Menu → **Cloud sync** → paste the same URL and anon key → your email and
   password → **Sign in**
3. It pulls your library down

**Add to home screen** — Chrome menu → *Add to Home screen* — and it opens like
an app.

**Check:** mark an episode watched on your phone, wait five seconds, reload the
page on your computer. The change is there.

---

# How it behaves afterwards

- **Anime data** refreshes every 6 hours by itself, via the Actions schedule.
  You never touch it. Run it by hand any time from the Actions tab.
- **Your library** saves locally straight away, then pushes to Supabase a few
  seconds later. Works offline; syncs when you're back.
- **Conflicts**: if the cloud copy is newer than the device you just opened, it
  asks which to keep and shows the show count on both sides. It never silently
  overwrites.

---

# When something goes wrong

**Actions run fails, red X** — 90% of the time it's Phase 1.6. Set workflow
permissions to read and write, then re-run.

**Page shows 404** — Pages takes a few minutes on first publish. Also confirm the
file is named `index.html`, lowercase, at the repo root.

**"Refresh from AniList" does nothing** — check `data/anime.json` exists in the
repo. If not, the Actions run hasn't succeeded yet.

**Cloud sync says "Failed: Invalid API key"** — you pasted the service_role key
or a truncated anon key. Re-copy the whole `eyJ...` string.

**Cloud sync says "Failed: Email not confirmed"** — either click the link in your
inbox, or do step 2.3 and create the account again.

**Supabase project paused** — free projects sleep after about a week idle. Open
the dashboard and click resume. Nothing is lost.

**Covers still missing for some shows** — those titles didn't match the feed.
Open the show → Artwork → paste a banner link by hand. The matcher handles
typos, but some of your entries are too garbled to resolve.

---

# What lives where, once you're done

| | Contents | Visible to |
|---|---|---|
| GitHub repo | app code, refresh script, public anime data | anyone |
| Supabase row | your library JSON | you only |
| Your browser | working copy of your library | you only |
| AniList | nothing about you — it only answers queries | — |
