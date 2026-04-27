import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const FOOTBALL_API = "https://v3.football.api-sports.io";
const HEADERS = () => ({ "x-apisports-key": process.env.API_SPORTS_KEY });

app.get("/", (req, res) => {
  res.send("STEALTH FOOTBALL API PROXY — RUNNING");
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

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`STEALTH FOOTBALL PROXY RUNNING ON ${PORT}`);
});