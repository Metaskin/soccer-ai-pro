import { FOOTBALL, key, cors, up } from "../_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    return res.json(await up(`${FOOTBALL}/fixtures?live=all`, key()));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
