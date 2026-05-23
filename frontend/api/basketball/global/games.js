import { BSKT, key, cors, query, up } from "../../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q    = query(req);
  const date = q.get("date");
  const team = q.get("team");
  const last = q.get("last");

  try {
    if (team) {
      // Team recent form: ?team={id}&last=5
      const url = `${BSKT}/games?team=${team}${last ? `&last=${last}` : ""}`;
      return res.json(await up(url, key()));
    }
    if (!date) return res.status(400).json({ error: "date or team param required" });
    return res.json(await up(`${BSKT}/games?date=${date}`, key()));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
