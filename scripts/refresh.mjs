// scripts/refresh.mjs
// Runs on a schedule in GitHub Actions. Pulls PUBLIC anime data from AniList —
// what's airing, what's announced, what's well rated — and writes data/anime.json.
//
// It never sees your library. It doesn't know who you are. There is nothing
// personal in the file it produces, which is why the repo can be public.
//
// The app downloads that one file on open and matches it against your library
// locally, in your browser.

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "data");
const OUT = path.join(OUT_DIR, "anime.json");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dateOf = d => (d && d.year)
  ? `${d.year}-${String(d.month || 1).padStart(2, "0")}-${String(d.day || 1).padStart(2, "0")}`
  : "";

async function gql(query, variables) {
  let lastReason = "unknown";
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables })
      });
    } catch (e) {
      lastReason = "network: " + e.message;
      console.log(`  attempt ${attempt}: ${lastReason}`);
      await sleep(3000); continue;
    }
    if (res.status === 429) {
      lastReason = "rate limited";
      console.log(`  attempt ${attempt}: rate limited, waiting`);
      await sleep(10000); continue;
    }
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); }
    catch { lastReason = `HTTP ${res.status}, not JSON: ${text.slice(0, 200)}`;
      console.log(`  attempt ${attempt}: ${lastReason}`); await sleep(2500); continue; }

    if (body.errors && body.errors.length) {
      lastReason = body.errors.map(e => e.message).join(" | ");
      console.log(`  attempt ${attempt}: AniList said: ${lastReason}`);
      // a bad query will never succeed, so stop retrying it
      if (/Cannot query|Unknown argument|Expected type|Unknown type/i.test(lastReason)) break;
      await sleep(2500); continue;
    }
    if (body.data) return body.data;
    lastReason = `HTTP ${res.status}, no data`;
    console.log(`  attempt ${attempt}: ${lastReason}`);
    await sleep(2500);
  }
  throw new Error(lastReason);
}

const FIELDS = `
  id
  title { romaji english native }
  status format episodes duration
  season seasonYear
  averageScore popularity genres
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode { episode airingAt }
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  relations { edges { relationType node {
    id title { romaji english } status format episodes startDate { year month day } } } }
`;

const PAGE_Q = `query ($page: Int, $season: MediaSeason, $year: Int, $status: MediaStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, season: $season, seasonYear: $year, status: $status,
          sort: [POPULARITY_DESC], isAdult: false) { ${FIELDS} }
  }
}`;

const TOP_Q = `query ($page: Int, $year: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, averageScore_greater: 69,
          sort: [SCORE_DESC], isAdult: false, format_in: [TV, TV_SHORT, MOVIE, ONA]) { ${FIELDS} }
  }
}`;

function seasonOf(d) {
  const m = d.getMonth();
  if (m <= 1 || m === 11) return { season: m === 11 ? "WINTER" : "WINTER", year: m === 11 ? d.getFullYear() + 1 : d.getFullYear() };
  if (m <= 4) return { season: "SPRING", year: d.getFullYear() };
  if (m <= 7) return { season: "SUMMER", year: d.getFullYear() };
  return { season: "FALL", year: d.getFullYear() };
}
function nextSeason(s) {
  const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const i = order.indexOf(s.season);
  return i === 3 ? { season: "WINTER", year: s.year + 1 } : { season: order[i + 1], year: s.year };
}

function shape(m) {
  const sequel = (m.relations?.edges || [])
    .filter(e => e.relationType === "SEQUEL" && e.node && e.node.status === "NOT_YET_RELEASED")[0];
  return {
    id: m.id,
    title: m.title.romaji || m.title.english,
    english: m.title.english || "",
    native: m.title.native || "",
    status: m.status === "RELEASING" ? "airing"
      : m.status === "NOT_YET_RELEASED" ? "announced"
      : m.status === "FINISHED" ? "finished" : "other",
    format: m.format || "TV",
    episodes: m.episodes || null,
    aired: m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) : (m.status === "FINISHED" ? (m.episodes || null) : null),
    nextEpisode: m.nextAiringEpisode ? m.nextAiringEpisode.episode : null,
    nextDate: m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10) : "",
    weekday: m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000).getUTCDay() : null,
    start: dateOf(m.startDate),
    end: dateOf(m.endDate),
    season: m.season || "", year: m.seasonYear || null,
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    popularity: m.popularity || 0,
    genres: m.genres || [],
    studio: m.studios?.nodes?.[0]?.name || "",
    cover: m.coverImage?.extraLarge || m.coverImage?.large || "",
    banner: m.bannerImage || "",
    blurb: (m.description || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 260),
    sequel: sequel ? {
      title: sequel.node.title.english || sequel.node.title.romaji,
      date: dateOf(sequel.node.startDate),
      episodes: sequel.node.episodes || null
    } : null
  };
}

async function collect(label, query, vars, cap = 4) {
  const out = [];
  for (let page = 1; page <= cap; page++) {
    let d;
    try { d = await gql(query, Object.assign({ page }, vars)); }
    catch (e) {
      console.log(`  ${label}: stopped at page ${page} — ${e.message}`);
      break;
    }
    (d.Page.media || []).forEach(m => out.push(shape(m)));
    if (!d.Page.pageInfo.hasNextPage) break;
    await sleep(900);
  }
  console.log(`  ${label}: ${out.length}`);
  return out;
}

const now = new Date();
const cur = seasonOf(now);
const nxt = nextSeason(cur);

console.log(`Refreshing: ${cur.season} ${cur.year} airing, ${nxt.season} ${nxt.year} upcoming, top rated ${cur.year}`);

const airing = await collect("airing", PAGE_Q, { season: cur.season, year: cur.year, status: "RELEASING" }, 4);
await sleep(900);
const upcoming = await collect("upcoming", PAGE_Q, { season: nxt.season, year: nxt.year, status: "NOT_YET_RELEASED" }, 3);
await sleep(900);
const top = await collect("top rated", TOP_Q, { year: cur.year }, 3);

const byId = new Map();
[...airing, ...upcoming, ...top].forEach(m => { if (!byId.has(m.id)) byId.set(m.id, m); });

const payload = {
  generated: new Date().toISOString(),
  season: `${cur.season} ${cur.year}`,
  counts: { airing: airing.length, upcoming: upcoming.length, top: top.length, total: byId.size },
  shows: [...byId.values()]
};

if (!byId.size) {
  console.error("\nNothing came back from AniList. The messages above say why.");
  console.error("Nothing written — the previous data/anime.json is left untouched.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`\nWrote data/anime.json — ${payload.counts.total} shows (${airing.length} airing, ${upcoming.length} upcoming, ${top.length} top rated)`);
