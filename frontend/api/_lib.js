// Shared utilities for all API route handlers (Vercel ignores _-prefixed files as endpoints)
export const FOOTBALL  = "https://v3.football.api-sports.io";
export const BSKT      = "https://v1.basketball.api-sports.io";
export const ESPN_NBA  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
export const ESPN_WNBA = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba";
export const UA        = { "User-Agent": "Mozilla/5.0 (compatible; StealthSports/1.0)" };

export const key = () => ({ "x-apisports-key": process.env.API_SPORTS_KEY });

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function query(req) {
  const i = req.url.indexOf("?");
  return new URLSearchParams(i < 0 ? "" : req.url.slice(i + 1));
}

export async function up(url, hdrs) {
  const r = await fetch(url, { headers: hdrs });
  if (!r.ok) throw new Error(`upstream HTTP ${r.status} — ${url}`);
  return r.json();
}
