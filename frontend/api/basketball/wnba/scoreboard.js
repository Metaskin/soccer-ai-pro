import { ESPN_WNBA, UA, cors, query, up } from "../../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q   = query(req);
  let url   = `${ESPN_WNBA}/scoreboard?limit=${q.get("limit") || 50}`;
  if (q.get("dates")) url += `&dates=${q.get("dates")}`;
  try {
    return res.json(await up(url, UA));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
