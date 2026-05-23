import { FOOTBALL, key, cors, query, up } from "../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q   = query(req);
  let url   = `${FOOTBALL}/fixtures?`;
  if (q.get("date"))   url += `date=${q.get("date")}&`;
  if (q.get("league")) url += `league=${q.get("league")}&`;
  if (q.get("season")) url += `season=${q.get("season")}&`;
  if (q.get("next"))   url += `next=${q.get("next")}&`;
  if (q.get("id"))     url += `id=${q.get("id")}&`;
  try {
    return res.json(await up(url, key()));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
