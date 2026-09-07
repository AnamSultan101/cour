# Cour Tracker — living design document

Last updated: 6 September 2026 · Current build: **v17** · Spec revision 3

This is the working record for the project. It has three jobs: describe what
exists today, capture every change asked for, and hold the design we're moving
toward. Update it as decisions land rather than re-deciding them in chat.

---

## 1. What this is

A personal anime tracker for a ~236 title library. Single-file HTML app with its
own saved database. Not Notion, not a spreadsheet — a home base for what's
airing, what's watched, what's waiting, and what to watch next.

**The core complaint, stated plainly:** it's a painting, not a living list.
Everything in it has to be typed by hand and nothing ever updates itself.

---

## 2. Environment — the constraints that shaped everything

Tested directly, not assumed:

| Route | Result |
|---|---|
| AniList API from the Claude artifact frame | **blocked** |
| MyAnimeList / Jikan from the artifact frame | **blocked** |
| External images in the artifact frame | **blocked** |
| api.anthropic.com (Claude) from the frame | works |
| Native `prompt()` / `confirm()` / downloads | **blocked** |
| AniList / Jikan from Node on a PC | works |
| Jikan on 5 Sep 2026 | HTTP 504, service-side outage |

**Consequences.** Covers can't be fetched inside the artifact at all. Metadata
that appeared earlier came from Claude, not from any anime database — the
library has never held a single cover URL. All dialogs must be in-app; all
backups must be copy-paste rather than file download.

**Decision made:** the app will be **hosted** so it can refresh itself. That
removes every restriction above at once.

---

## 3. What works right now (v12)

- Import from the numbered text list, with ⭐/🌟 and ❌ understood
- Title cleanup, duplicate merging, genre repair
- 236 shows loaded; 136 auto-filed as Completed by the finished-airing rule
- Landscape 16:9 tiles, streaming-site layout, badges
- Four themes — Old computer (default), Night, Kids, Soft dark — with per-theme accent
- Burger side menu, grouped, with counts
- Hero slideshow on Home, with a configurable ▶ Watch link
- Per-section cover banners, pasteable by hand
- Footer with genre chips, top five, pick-up-again, quick actions
- Rankings sidebar — overall, per-genre, and custom lists
- Custom named lists with manual ordering
- Sorting wizard, six branches, fetch-then-ask
- Picks drawer — 7+ scored, favourite genres first
- Backup / restore by copy-paste, storage inspector, artwork-link importer
- Companion script `fetch-anime-images.mjs` — AniList first, MAL fallback

## 4. What's broken or missing

- **Nothing is derived.** Every status is set once and never recalculates.
- **Seasons aren't modelled.** One `episodes` number and one `currentEpisode` for a whole franchise.
- **Sequels don't exist.** Slime S1 and S4 are the same row.
- **No backlog count.** Nowhere does it compute "3 episodes waiting".
- **No schedule.** No day-of-week, no weekly grid.
- **The wizard is one-shot.** Files a show, never revisits.
- **No sort control anywhere.** Genre filter on one tab; everything else is import order.
- **Matching is by title**, so near-misses grab the wrong show.
- 31 titles unidentified (typos or genuinely obscure).

---

## 5. Everything asked for, collected

### Layout and looks
- Landscape / TV-ratio tiles, not portrait posters ✅ done
- Four themes: night, old computer, kids light, soft dark ✅ done
- Look like a streaming site — dense grid, badges, side rankings ✅ done
- Hero slideshow of ongoing anime, with a Play button ✅ done
- Cover image per tab / section, pasteable or fetched ✅ done
- Footer that's a real finisher: image, genre browsing, useful links ✅ done
- Burger side menu replacing the tab strip ✅ done
- Rankings bigger and more distinct; more rankings further down the page ✅ done
- Our own rankings: overall, isekai, shounen, plus custom curation ✅ done

### Status logic
- ❌ means "not my thing", not dropped ✅ done
- Finished shows and movies auto-file as Completed ✅ done
- Completed stays in Completed, off Home ✅ **decided**
- Ongoing show can never be Completed — tops out at Caught up — **spec'd, pending**
- Episode-behind = Watching; season-behind = needs a decision — **spec'd, pending**
- Four intent tiers: treasure / watch later / might watch / dropped — **spec'd, pending**
- Dropped records where you stopped, keeps season chronology — **spec'd, pending**
- Movies and OVAs asked about separately — **spec'd, pending**
- Wizard states season count and episode count before asking — **spec'd, pending**
- New episode alerts — **pending**
- Upcoming seasons with dates — **pending**

### Home and pages
- Hero limited to what you're watching or a season that just landed — **pending**
- Episodes-out alerts above, weekly schedule below — **pending**
- Three lists: upcoming seasons · 7+ in your genres · watchlist — **pending**
- **Anime entity page with a visual season timeline — pending, missing entirely**
- Cover images must not stretch their container — **pending**
- Footer cover behind transparent content — **pending**
- Watch button goes to anikoto search — **pending**

### The wizard
- Fetch what's airing *first*, then ask ✅ done
- Answers that match how you remember: caught up / behind / stopped / never started ✅ done
- "Don't remember" as a real answer ✅ done
- Ask: caught up, saving for later, undecided, might drop — **pending**
- Re-run over time rather than once — **pending**

### Data
- Fetch artwork and metadata automatically — **blocked in artifact, works hosted**
- Covers per show, manual paste as fallback ✅ done
- Import artwork links from the script ✅ done

---

## 6. Decisions locked in

| Question | Answer |
|---|---|
| Where does fresh airing data come from? | **Host the app so it refreshes itself** |
| Finished show that never returns? | **Keep it in Completed, out of Home** |
| Both "undecided" and "might drop"? | **Yes, both** |
| ❌ means? | Not my thing — taste mismatch, not dropped |
| Default theme | Old computer (CRT) |
| Covers for now | Generated plates; real art once hosted |

---

## 6b. Why GitHub and Supabase — the split

Two different kinds of data, two different homes. That split is the whole design.

| | Public anime data | Your library |
|---|---|---|
| What | airing status, episode counts, air dates, sequels, scores, artwork | what you've watched, ratings, reviews, intent |
| Where | `data/anime.json` in a public GitHub repo | Supabase, one row, locked to your account |
| Refreshed by | GitHub Actions, every 6 hours | you, as you use the app |
| Who can read it | anyone — it's public anyway | only you |
| Needs a key | no. AniList is open | anon key + your password |

**GitHub** answers *how does it stay fresh.* Actions runs a scheduled job — real
cron, free on public repos — that queries AniList for the current season, next
season and top-rated titles, and commits one JSON file. The app downloads that
file on open. One request, no API calls from your browser, always current within
six hours.

**Supabase** answers *how do my phone and laptop agree.* It stores nothing but
your own library JSON, in a row keyed to your user id, behind row-level security.

**Why the keys are safe.** AniList needs none. The Supabase anon key is designed
to be public — it grants nothing without a login, and the RLS policy restricts
every request to `auth.uid() = user_id`. The service_role key, which is a real
secret, is never used. Your URL and anon key are typed into the app and kept in
device storage, so they aren't in the repo either. Nothing needs a `.env`.

**What the repo contains:** `index.html`, `scripts/refresh.mjs`,
`.github/workflows/refresh.yml`, `data/anime.json`. Nothing personal. Safe to
make public, which is what makes Actions free.

## 6c. What the system does, end to end

You give it a list of names. From there:

1. Feed matches each name to a real entry — English, romaji or native, and
   tolerates typos, so "Kimetsu Nu Yaiba" still finds Demon Slayer
2. Artwork, studio, year, score and synopsis fill themselves in
3. Seasons appear as separate entries; sequels are discovered and added
4. Airing status, episode count and next air date refresh every six hours
5. You supply only your position — what you've watched
6. Everything else derives: watching, caught up, season behind, completed
7. 7+ titles in your genres that you don't own become discovery candidates
8. Your library syncs across devices; the public data never touches your account

## 7. Target architecture

### 7.1 Franchises and entries

The one structural change everything depends on.

```
franchise  Slime            ← rating, review, genres, favourite, intent
  entry    S1     24 eps  ended    watched 24
  entry    S2     24 eps  ended    watched 24
  entry    Movie   1 ep   ended    watched 0
  entry    S4     24 eps  airing   watched 21   → 2 waiting
```

Progress lives on entries. Opinion lives on the franchise. Handles movies, OVAs,
split cours, and skipped seasons — all of which exist in this library.

### 7.2 Derived state

You type one thing: how far you've got. Everything else is computed.

```
available         = ended ? total : episodes aired so far
backlog           = available − watched
seasonsBehind     = count of entries fully unwatched that come after your position
franchise state   = see table
```

**The governing rule:** episode-behind means you're watching it. Season-behind
means it owes you a decision.

| State | Condition | Where it shows |
|---|---|---|
| Not started | nothing watched | Watchlist / Treasure |
| **Watching** | behind by episodes inside the latest season | Home, schedule, alerts |
| **Caught up** | every aired episode seen, show ongoing | waiting; alert on next drop |
| **Between seasons** | season ended, next announced | Upcoming, with countdown |
| **Season behind** | ≥1 whole season unwatched | decision queue |
| **Completed** | show finished forever **and** all watched | archive, never nags |

**Completed is only reachable when the anime itself is over.** An ongoing show
tops out at Caught up no matter how much has been seen. This was wrong in
revision 1.

### 7.3 Intent — asked only when season-behind

Four tiers, never collapsed into one:

**Treasure** (saving it) · **Watch later** (will get to it) · **Might watch**
(undecided, resurfaces) · **Dropped** (with position)

Episode-behind shows are never asked — they're simply Watching.

**Dropped keeps its position.** `droppedAt: {season, episode}` plus whether the
stop was mid-season or after finishing one. So "dropped after S2" and "quit 7
episodes into S1" stay distinct, and when a new season lands the wizard can ask
*"you stopped after S2 — it's back, in or out?"*

### 7.3b The wizard states the numbers before asking

> Slime — 4 seasons, S4 airing, 21 episodes out
> **Which season are you on?** [S1] [S2] [S3] [S4] [all of it] [never started]
>
> S4 has 21 episodes out. **Which episode?** [21 — all] [number] [don't remember]
>
> Also 1 movie, 2 OVAs. **Seen those?** [yes] [no] [skip]

Movies and OVAs are separate entries and get asked separately.

### 7.4 Sync by ID

Store the AniList id once. Every refresh after is exact — no fuzzy title
matching. AniList's relations field lists sequels, so **new seasons appear in the
library on their own**. Biggest single quality-of-life win in the redesign.

On open: refresh only airing or announced entries, ~30 of 236, batched ten per
request. Three requests, under two seconds. Full sweep monthly.

### 7.5 Home, in order down the page

1. **Hero** — only shows you're watching, or whose new season just landed
2. **New episodes out** — the alert row, above everything
3. **Continue watching** — episode-behind shows, with counts
4. **This week** — weekday schedule strip of what's airing
5. **Three lists**, side by side:
   - **Upcoming seasons** — shows you watch, with release dates
   - **Might be worth it** — announced or recent, 7+ score, your genres
   - **From the watchlist** — things you already said yes to
6. **Rankings** — overall, per genre, custom

### 7.5b Anime entity page

Currently missing entirely. One page per franchise:

- Banner, title, English title, year, studio, genres, community score
- Derived state line — *"Behind · 2 episodes waiting"* — and a **Watch** button
- **Season timeline**: every entry in chronological order — seasons, movies,
  OVAs — each showing episodes watched of total, a progress bar, and a status
  chip. Watched entries filled, current partially filled, unwatched hollow.
  Tap any entry to set position; **+1** and **mark season watched** buttons.
- Your rating, review, favourite, notes — franchise level, entered once

### 7.6 Wizard as the daily driver

Four triggers instead of one import-time run:

- A new unsorted show arrives, including auto-discovered sequels
- A show goes cold — backlog untouched 60+ days → *still watching, or shelving?*
- An **Undecided** item's review date comes up
- A **Might drop** show gets a new season → *it's back. in or out?*

### 7.7 Cour awareness

The app is named for it and doesn't use it. Show the running cour:
*"Fall 2026 — 6 shows, 3 behind, 2 finish this month."*

### 7.8 Sorting and filtering

Every grid gets a sort: title, year, community score, your rating, backlog size,
recently updated, date added. Stackable filters — genre (multi-select), status,
format, year range, studio. **Any filter combination saves as a list**, merging
rankings and filters into one idea.

---

### 7.9 Visual fixes outstanding

- **Cover sizing** — an image that isn't 16:9 currently stretches its container.
  Fix with a fixed-ratio box and `object-fit: cover` so the frame never grows.
- **Footer** — the cover image should sit behind transparent content, not as an
  opaque band.
- **Watch button** — points at anikoto search, per the link given:
  `https://anikoto.cz/…?…={q}`. Exact query pattern still to be confirmed by
  running one search on the site and copying the address.

## 8. Build order

1. Data model + migration of the 236 rows into franchises
2. Derived state — the six-state table, with Completed gated on the show ending
3. Anime entity page with the season timeline
4. Wizard: season → episode → intent, numbers shown before asking
5. Home rebuild — alerts, continue, week, three lists
6. Sync by ID, sequel discovery
7. Sort, filter, saved lists
8. Cour view, visual fixes

Steps 1–2 are the painting-to-living-list change. The rest is refinement.

---

## 9. Open questions

- **Rewatches.** Can a franchise be Done *and* have a rewatch in progress, or is
  a rewatch just resetting position? Decides whether progress is one number or a
  small history. **Still unanswered — blocks the entity page.**
- **Anikoto search URL** — need the exact query string pattern.
- **Hosting.** Which host, and does the app become a single URL used across
  phone and desktop?
- **The 31 unidentified titles** — resolve by hand or leave parked?
- Per-season notes and ratings, or franchise-level only?

---

## 10. Version history

| Build | What changed |
|---|---|
| v1 | First landscape rebuild |
| v2 | Parser fix for `3- Title`; ❌ → Not my thing; Treasure; custom lists |
| v3 | AniList fetch, streaming-site cards, ranking sidebar, fetch-then-ask triage |
| v3.5 | Jikan fallback added — the build believed to work |
| v4 | Burger nav, hero, tab covers, footer, auto-complete rule |
| v5 | Layout clipping fix; hero stopped re-rendering the page |
| v6 | Native dialogs replaced — they were blocked and jammed the fetch |
| v7 | Triage fallback, copy-paste backup, theme in bar, bigger banners |
| v8 | Probe removed, storage key migration, visible fetch progress |
| v9 | `claudeFill` restored, image capability test |
| v10 | Standalone build with localStorage and seeded library |
| v11 | Storage inspector across all saved keys |
| v12 | Artwork-link importer for the companion script |

## 11. Companion files

- `cour-tracker.html` — the app
- `cour-tracker-standalone.html` — same app, runs outside the artifact frame
- `cour-tracker-library.json` — the filled library, 236 shows
- `anime-names.txt` — 235 titles for the fetch script
- `fetch-anime-images.mjs` — AniList-first cover fetcher, run with Node
