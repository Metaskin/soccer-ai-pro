const FOOTBALL_API  = "https://v3.football.api-sports.io";
const BSKT_API      = "https://v1.basketball.api-sports.io";
const ESPN_NBA_API  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WNBA_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba";
const ESPN_HEADERS  = { "User-Agent": "Mozilla/5.0 (compatible; StealthSports/1.0)" };

function sportsKey() {
  return { "x-apisports-key": process.env.API_SPORTS_KEY };
}

async function apiFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status} from ${url}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Extract path after /api/ and parse query string
  const [rawPath, rawQs] = req.url.replace(/^\/api\//, "").split("?");
  const q = new URLSearchParams(rawQs || "");

  try {
    // ── Football ────────────────────────────────────────────────────────────────
    if (rawPath === "football/proxy") {
      const endpoint = q.get("endpoint");
      if (!endpoint) return res.status(400).json({ error: "endpoint param required" });
      return res.json(await apiFetch(`${FOOTBALL_API}${endpoint}`, sportsKey()));
    }

    if (rawPath === "football/live") {
      return res.json(await apiFetch(`${FOOTBALL_API}/fixtures?live=all`, sportsKey()));
    }

    if (rawPath === "football/fixtures") {
      let url = `${FOOTBALL_API}/fixtures?`;
      if (q.get("date"))   url += `date=${q.get("date")}&`;
      if (q.get("league")) url += `league=${q.get("league")}&`;
      if (q.get("season")) url += `season=${q.get("season")}&`;
      if (q.get("next"))   url += `next=${q.get("next")}&`;
      return res.json(await apiFetch(url, sportsKey()));
    }

    if (rawPath === "football/standings") {
      return res.json(await apiFetch(
        `${FOOTBALL_API}/standings?league=${q.get("league")}&season=${q.get("season")}`,
        sportsKey()
      ));
    }

    // ── Basketball (API-Sports, global) ─────────────────────────────────────────
    if (rawPath === "basketball/global/live") {
      const today = new Date().toISOString().slice(0, 10);
      const data  = await apiFetch(`${BSKT_API}/games?date=${today}`, sportsKey());
      const LIVE  = new Set(["Q1","Q2","Q3","Q4","OT","HT","BT"]);
      const all   = data?.response || [];
      const live  = all.filter(g => LIVE.has(g.status?.short));
      return res.json({ ...data, response: live, results: live.length });
    }

    if (rawPath === "basketball/global/games") {
      const date = q.get("date");
      if (!date) return res.status(400).json({ error: "date param required" });
      return res.json(await apiFetch(`${BSKT_API}/games?date=${date}`, sportsKey()));
    }

    // ── ESPN NBA / WNBA ─────────────────────────────────────────────────────────
    if (rawPath === "basketball/scoreboard") {
      const limit = q.get("limit") || 50;
      const dates = q.get("dates");
      let url = `${ESPN_NBA_API}/scoreboard?limit=${limit}`;
      if (dates) url += `&dates=${dates}`;
      return res.json(await apiFetch(url, ESPN_HEADERS));
    }

    if (rawPath === "basketball/wnba/scoreboard") {
      const limit = q.get("limit") || 50;
      const dates = q.get("dates");
      let url = `${ESPN_WNBA_API}/scoreboard?limit=${limit}`;
      if (dates) url += `&dates=${dates}`;
      return res.json(await apiFetch(url, ESPN_HEADERS));
    }

    if (rawPath === "basketball/news") {
      const limit = q.get("limit") || 10;
      return res.json(await apiFetch(`${ESPN_NBA_API}/news?limit=${limit}`, ESPN_HEADERS));
    }

    if (rawPath === "sports/news") {
      const limit = q.get("limit") || 8;
      const [nbaR, wnbaR, eplR] = await Promise.allSettled([
        apiFetch(`${ESPN_NBA_API}/news?limit=${limit}`,  ESPN_HEADERS),
        apiFetch(`${ESPN_WNBA_API}/news?limit=${limit}`, ESPN_HEADERS),
        apiFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=${limit}`, ESPN_HEADERS),
      ]);
      const tag = (r, sport, emoji) =>
        r.status === "fulfilled" ? (r.value.articles || []).map(a => ({ ...a, _sport: sport, _emoji: emoji })) : [];
      return res.json({
        articles: [...tag(nbaR, "NBA", "🏀"), ...tag(wnbaR, "WNBA", "🏀"), ...tag(eplR, "EPL", "⚽")]
      });
    }

    return res.status(404).json({ error: `Unknown API route: /api/${rawPath}` });

  } catch (err) {
    console.error(`[api/${rawPath}] error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
