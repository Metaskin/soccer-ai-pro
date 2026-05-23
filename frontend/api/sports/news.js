import { ESPN_NBA, ESPN_WNBA, UA, cors, query, up } from "../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q     = query(req);
  const limit = q.get("limit") || 8;
  const [nbaR, wnbaR, eplR] = await Promise.allSettled([
    up(`${ESPN_NBA}/news?limit=${limit}`,  UA),
    up(`${ESPN_WNBA}/news?limit=${limit}`, UA),
    up(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=${limit}`, UA),
  ]);
  const tag = (r, sport, emoji) =>
    r.status === "fulfilled" ? (r.value.articles || []).map(a => ({ ...a, _sport: sport, _emoji: emoji })) : [];
  return res.json({
    articles: [...tag(nbaR, "NBA", "🏀"), ...tag(wnbaR, "WNBA", "🏀"), ...tag(eplR, "EPL", "⚽")]
  });
}
