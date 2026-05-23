export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    status: "ok",
    ts: new Date().toISOString(),
    apiKey: process.env.API_SPORTS_KEY ? "set" : "MISSING — add API_SPORTS_KEY to Vercel env vars",
  });
}
