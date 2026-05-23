import { FOOTBALL, key, cors, query, up } from "../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  const q        = query(req);
  const endpoint = q.get("endpoint");
  if (!endpoint) return res.status(400).json({ error: "endpoint param required" });
  try {
    return res.json(await up(`${FOOTBALL}${endpoint}`, key()));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
