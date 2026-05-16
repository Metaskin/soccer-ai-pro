import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const FOOTBALL_API = "https://v3.football.api-sports.io";
const HEADERS = () => ({ "x-apisports-key": process.env.API_SPORTS_KEY });

const ESPN_NBA_API  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WNBA_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba";
const ESPN_HEADERS  = { "User-Agent": "Mozilla/5.0 (compatible; StealthSports/1.0)" };

// API-Sports Basketball (worldwide coverage — same key, separate quota from football)
const BSKT_API     = "https://v1.basketball.api-sports.io";
const BSKT_HEADERS = () => ({ "x-apisports-key": process.env.API_SPORTS_KEY });

app.get("/", (req, res) => {
  res.send("STEALTH FOOTBALL API PROXY — RUNNING");
});

// Generic football proxy — forwards any endpoint path+query to the football API
app.get("/api/football/proxy", async (req, res) => {
  try {
    const { endpoint } = req.query;
    if (!endpoint) return res.status(400).json({ error: "endpoint query param required" });
    const response = await axios.get(`${FOOTBALL_API}${endpoint}`, { headers: HEADERS() });
    res.json(response.data);
  } catch (error) {
    console.error("Football proxy error:", error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch football data" });
  }
});

// Proxy: live fixtures
app.get("/api/football/live", async (req, res) => {
  try {
    const response = await axios.get(`${FOOTBALL_API}/fixtures?live=all`, {
      headers: HEADERS()
    });
    res.json(response.data);
  } catch (error) {
    console.error("Live fixtures error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch live fixtures" });
  }
});

// Proxy: fixtures by date
app.get("/api/football/fixtures", async (req, res) => {
  try {
    const { date, league, season, next } = req.query;
    let url = `${FOOTBALL_API}/fixtures?`;
    if (date) url += `date=${date}&`;
    if (league) url += `league=${league}&`;
    if (season) url += `season=${season}&`;
    if (next) url += `next=${next}&`;

    const response = await axios.get(url, { headers: HEADERS() });
    res.json(response.data);
  } catch (error) {
    console.error("Fixtures error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// Proxy: standings
app.get("/api/football/standings", async (req, res) => {
  try {
    const { league, season } = req.query;
    const response = await axios.get(
      `${FOOTBALL_API}/standings?league=${league}&season=${season}`,
      { headers: HEADERS() }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Standings error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

// ── Global Basketball (API-Sports) ────────────────────────────────────────────

// All currently live games worldwide (fetches today's games, filters by in-progress status)
app.get("/api/basketball/global/live", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await axios.get(`${BSKT_API}/games?date=${today}`, { headers: BSKT_HEADERS() });
    const LIVE = new Set(["Q1","Q2","Q3","Q4","OT","HT","BT"]);
    const all = response.data?.response || [];
    const live = all.filter(g => LIVE.has(g.status?.short));
    res.json({ ...response.data, response: live, results: live.length });
  } catch (error) {
    console.error("Global bskt live error:", error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch live basketball", code: error.response?.status });
  }
});

// Games by date (YYYY-MM-DD)
app.get("/api/basketball/global/games", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date query param required" });
    const response = await axios.get(`${BSKT_API}/games?date=${date}`, { headers: BSKT_HEADERS() });
    res.json(response.data);
  } catch (error) {
    console.error("Global bskt games error:", error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch basketball games", code: error.response?.status });
  }
});

// ── ESPN (NBA / WNBA) ─────────────────────────────────────────────────────────

// Proxy: NBA scoreboard (today's games + optional date YYYYMMDD)
app.get("/api/basketball/scoreboard", async (req, res) => {
  try {
    const { dates, limit = 50 } = req.query;
    let url = `${ESPN_NBA_API}/scoreboard?limit=${limit}`;
    if (dates) url += `&dates=${dates}`;
    const response = await axios.get(url, { headers: ESPN_HEADERS });
    res.json(response.data);
  } catch (error) {
    console.error("NBA scoreboard error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch NBA scoreboard" });
  }
});

// Proxy: WNBA scoreboard
app.get("/api/basketball/wnba/scoreboard", async (req, res) => {
  try {
    const { dates, limit = 50 } = req.query;
    let url = `${ESPN_WNBA_API}/scoreboard?limit=${limit}`;
    if (dates) url += `&dates=${dates}`;
    const response = await axios.get(url, { headers: ESPN_HEADERS });
    res.json(response.data);
  } catch (error) {
    console.error("WNBA scoreboard error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch WNBA scoreboard" });
  }
});

// Proxy: NBA news
app.get("/api/basketball/news", async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const response = await axios.get(`${ESPN_NBA_API}/news?limit=${limit}`, { headers: ESPN_HEADERS });
    res.json(response.data);
  } catch (error) {
    console.error("NBA news error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch NBA news" });
  }
});

// Multi-sport news feed (NBA + WNBA + EPL soccer)
app.get("/api/sports/news", async (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const [nbaRes, wnbaRes, eplRes] = await Promise.allSettled([
      axios.get(`${ESPN_NBA_API}/news?limit=${limit}`,  { headers: ESPN_HEADERS }),
      axios.get(`${ESPN_WNBA_API}/news?limit=${limit}`, { headers: ESPN_HEADERS }),
      axios.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=${limit}`, { headers: ESPN_HEADERS }),
    ]);
    const tag = (res, sport, emoji) =>
      res.status === "fulfilled" ? (res.value.data.articles || []).map(a => ({ ...a, _sport: sport, _emoji: emoji })) : [];

    const articles = [
      ...tag(nbaRes,  "NBA",  "🏀"),
      ...tag(wnbaRes, "WNBA", "🏀"),
      ...tag(eplRes,  "EPL",  "⚽"),
    ];
    res.json({ articles });
  } catch (error) {
    console.error("Sports news error:", error.message);
    res.status(500).json({ error: "Failed to fetch sports news" });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`STEALTH FOOTBALL PROXY RUNNING ON ${PORT}`);
});