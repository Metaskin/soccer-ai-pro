import { FOOTBALL, key, cors, query, up } from "../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q = query(req);
  try {
    return res.json(await up(
      `${FOOTBALL}/standings?league=${q.get("league")}&season=${q.get("season")}`,
      key()
    ));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
