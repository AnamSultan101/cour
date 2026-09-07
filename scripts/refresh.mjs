// scripts/refresh.mjs
// Builds data/anime.json — public anime data only, nothing personal.
// Tries AniList first. If that's unreachable (Cloudflare sometimes refuses
// datacenter IPs, which is what GitHub runners are), falls back to Jikan.
// Succeeds if either source answers.

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "data");
const OUT = path.join(OUT_DIR, "anime.json");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, "0");
const dateOf = d => (d && d.year) ? `${d.year}-${pad(d.month || 1)}-${pad(d.day || 1)}` : "";
const DAYNAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/* ---------------- source A: AniList ---------------- */

const FIELDS = `
  id title { romaji english native }
  status format episodes season seasonYear
  averageScore popularity genres
  startDate { year month day } endDate { year month day }
  nextAiringEpisode { episode airingAt }
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large } bannerImage
  description(asHtml: false)
  relations { edges { relationType node {
    id title { romaji english } status episodes startDate { year month day } } } }
`;
const PAGE_Q = `query ($page: Int, $season: MediaSeason, $year: Int, $status: MediaStatus) {
  Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
    media(type: ANIME, season: $season, seasonYear: $year, status: $status,
          sort: [POPULARITY_DESC], isAdult: false) { ${FIELDS} } } }`;
const TOP_Q = `query ($page: Int, $year: Int) {
  Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, averageScore_greater: 69, sort: [SCORE_DESC],
          isAdult: false, format_in: [TV, TV_SHORT, MOVIE, ONA]) { ${FIELDS} } } }`;

async function anilist(query, variables) {
  let reason = "unknown";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables })
      });
    } catch (e) { reason = "network: " + e.message; console.log(`    anilist try ${attempt}: ${reason}`); await sleep(2000); continue; }

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); }
    catch { reason = `HTTP ${res.status}: ${text.slice(0, 160)}`; console.log(`    anilist try ${attempt}: ${reason}`); await sleep(2000); continue; }

    if (body.errors?.length) {
      reason = body.errors.map(e => e.message).join(" | ");
      console.log(`    anilist try ${attempt}: ${reason}`);
      if (/Cannot query|Unknown argument|Expected type|Unknown type/i.test(reason)) break;
      await sleep(2000); continue;
    }
    if (body.data) return body.data;
  }
  throw new Error(reason);
}

function fromAniList(m) {
  const seq = (m.relations?.edges || [])
    .filter(e => e.relationType === "SEQUEL" && e.node?.status === "NOT_YET_RELEASED")[0];
  const next = m.nextAiringEpisode;
  return {
    src: "anilist", id: "al" + m.id,
    title: m.title.romaji || m.title.english,
    english: m.title.english || "", native: m.title.native || "",
    status: m.status === "RELEASING" ? "airing"
      : m.status === "NOT_YET_RELEASED" ? "announced"
      : m.status === "FINISHED" ? "finished" : "other",
    format: m.format || "TV",
    episodes: m.episodes || null,
    aired: next ? Math.max(0, next.episode - 1) : (m.status === "FINISHED" ? (m.episodes || null) : null),
    nextDate: next ? new Date(next.airingAt * 1000).toISOString().slice(0, 10) : "",
    weekday: next ? new Date(next.airingAt * 1000).getUTCDay() : null,
    start: dateOf(m.startDate), end: dateOf(m.endDate),
    season: m.season || "", year: m.seasonYear || null,
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    genres: m.genres || [],
    studio: m.studios?.nodes?.[0]?.name || "",
    cover: m.coverImage?.extraLarge || m.coverImage?.large || "",
    banner: m.bannerImage || "",
    blurb: (m.description || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 260),
    sequel: seq ? { title: seq.node.title.english || seq.node.title.romaji, date: dateOf(seq.node.startDate), episodes: seq.node.episodes || null } : null
  };
}

/* ---------------- source B: Jikan (MyAnimeList) ---------------- */

async function jikan(pathname) {
  let reason = "unknown";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try { res = await fetch("https://api.jikan.moe/v4" + pathname, { headers: { Accept: "application/json" } }); }
    catch (e) { reason = "network: " + e.message; console.log(`    jikan try ${attempt}: ${reason}`); await sleep(2500); continue; }
    if (res.status === 429) { console.log(`    jikan try ${attempt}: rate limited`); await sleep(6000); continue; }
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      if (body.data) return body;
      reason = `HTTP ${res.status}: no data`;
    } catch { reason = `HTTP ${res.status}: ${text.slice(0, 160)}`; }
    console.log(`    jikan try ${attempt}: ${reason}`);
    await sleep(2500);
  }
  throw new Error(reason);
}

// MAL gives a broadcast weekday but not the current episode number.
// Estimate it from the start date and the weekly cadence.
function estimateAired(a) {
  const from = a.aired?.from ? new Date(a.aired.from) : null;
  if (!from || isNaN(from)) return null;
  const weeks = Math.floor((Date.now() - from.getTime()) / (7 * 864e5)) + 1;
  if (weeks < 1) return 0;
  return a.episodes ? Math.min(weeks, a.episodes) : weeks;
}
function nextFromWeekday(dayName) {
  if (!dayName) return { date: "", dow: null };
  const idx = DAYNAMES.indexOf(String(dayName).toLowerCase().replace(/s$/, ""));
  if (idx < 0) return { date: "", dow: null };
  const now = new Date();
  let add = (idx - now.getDay() + 7) % 7;
  if (add === 0) add = 7;
  const d = new Date(now.getTime() + add * 864e5);
  return { date: d.toISOString().slice(0, 10), dow: idx };
}

function fromJikan(a) {
  const airing = a.status === "Currently Airing";
  const nx = airing ? nextFromWeekday(a.broadcast?.day) : { date: "", dow: null };
  return {
    src: "mal", id: "mal" + a.mal_id,
    title: a.title, english: a.title_english || "", native: a.title_japanese || "",
    status: airing ? "airing" : (a.status === "Not yet aired" ? "announced" : "finished"),
    format: a.type || "TV",
    episodes: a.episodes || null,
    aired: airing ? estimateAired(a) : (a.episodes || null),
    nextDate: nx.date, weekday: nx.dow,
    start: a.aired?.from ? a.aired.from.slice(0, 10) : "",
    end: a.aired?.to ? a.aired.to.slice(0, 10) : "",
    season: (a.season || "").toUpperCase(), year: a.year || null,
    score: a.score || null,
    genres: (a.genres || []).map(g => g.name),
    studio: a.studios?.[0]?.name || "",
    cover: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "",
    banner: "",
    blurb: (a.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 260),
    sequel: null
  };
}

/* ---------------- run ---------------- */

function seasonOf(d) {
  const m = d.getMonth();
  if (m === 11) return { season: "WINTER", year: d.getFullYear() + 1 };
  if (m <= 1) return { season: "WINTER", year: d.getFullYear() };
  if (m <= 4) return { season: "SPRING", year: d.getFullYear() };
  if (m <= 7) return { season: "SUMMER", year: d.getFullYear() };
  return { season: "FALL", year: d.getFullYear() };
}
function nextSeason(s) {
  const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const i = order.indexOf(s.season);
  return i === 3 ? { season: "WINTER", year: s.year + 1 } : { season: order[i + 1], year: s.year };
}

const now = new Date();
const cur = seasonOf(now), nxt = nextSeason(cur);
console.log(`Building feed for ${cur.season} ${cur.year} (next: ${nxt.season} ${nxt.year})\n`);

const shows = [];
let source = "";

console.log("Trying AniList…");
try {
  for (const [label, q, vars, cap] of [
    ["airing", PAGE_Q, { season: cur.season, year: cur.year, status: "RELEASING" }, 4],
    ["upcoming", PAGE_Q, { season: nxt.season, year: nxt.year, status: "NOT_YET_RELEASED" }, 3],
    ["top rated", TOP_Q, { year: cur.year }, 3]
  ]) {
    for (let page = 1; page <= cap; page++) {
      const d = await anilist(q, Object.assign({ page }, vars));
      (d.Page.media || []).forEach(m => shows.push(fromAniList(m)));
      if (!d.Page.pageInfo.hasNextPage) break;
      await sleep(800);
    }
    console.log(`  ${label}: running total ${shows.length}`);
  }
  source = "anilist";
} catch (e) {
  console.log(`  AniList unusable: ${e.message}\n`);
}

if (!shows.length) {
  console.log("Falling back to MyAnimeList…");
  try {
    for (const [label, base, pages] of [
      ["airing", "/seasons/now", 3],
      ["upcoming", "/seasons/upcoming", 2],
      ["top rated", "/top/anime", 2]
    ]) {
      for (let page = 1; page <= pages; page++) {
        const body = await jikan(`${base}?page=${page}&limit=25&sfw=true`);
        (body.data || []).forEach(a => shows.push(fromJikan(a)));
        if (!body.pagination?.has_next_page) break;
        await sleep(1200);
      }
      console.log(`  ${label}: running total ${shows.length}`);
    }
    source = "mal";
  } catch (e) {
    console.log(`  MyAnimeList unusable too: ${e.message}`);
  }
}

if (!shows.length) {
  console.error("\nNeither source answered. Nothing written; the existing data/anime.json is untouched.");
  console.error("The messages above say why — usually a blocked IP range or an outage.");
  process.exit(1);
}

const byKey = new Map();
shows.forEach(s => { const k = (s.english || s.title).toLowerCase().replace(/[^a-z0-9]/g, ""); if (!byKey.has(k)) byKey.set(k, s); });
const list = [...byKey.values()];

const payload = {
  generated: new Date().toISOString(),
  source,
  season: `${cur.season} ${cur.year}`,
  counts: {
    total: list.length,
    airing: list.filter(s => s.status === "airing").length,
    announced: list.filter(s => s.status === "announced").length
  },
  shows: list
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`\nWrote data/anime.json from ${source} — ${payload.counts.total} shows, ${payload.counts.airing} airing, ${payload.counts.announced} announced.`);
