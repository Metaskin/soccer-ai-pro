import { BSKT, key, cors, up } from "../../_lib.js";

const LIVE_ST = new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HT", "BT"]);

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data  = await up(`${BSKT}/games?date=${today}`, key());
    const all   = data?.response || [];
    const live  = all.filter(g => LIVE_ST.has(g.status?.short));
    return res.json({ ...data, response: live, results: live.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
