import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

/**
 * MOCK DATA - Fallback for API limits or errors
 */
const MOCK_LIVE_MATCHES = [
  {
    fixture: { id: 1, status: { short: "LIVE", elapsed: 74 } },
    teams: { home: { name: "Real Madrid" }, away: { name: "Manchester City" } },
    goals: { home: 2, away: 2 },
    league: { name: "UEFA Champions League" },
  },
  {
    fixture: { id: 2, status: { short: "LIVE", elapsed: 32 } },
    teams: { home: { name: "Arsenal" }, away: { name: "Bayern Munich" } },
    goals: { home: 1, away: 0 },
    league: { name: "UEFA Champions League" },
  },
];

const MOCK_FIXTURES = [
  {
    fixture: { id: 101, date: new Date().toISOString() },
    teams: { home: { name: "Liverpool" }, away: { name: "Chelsea" } },
    league: { name: "Premier League" },
  },
  {
    fixture: { id: 102, date: new Date().toISOString() },
    teams: { home: { name: "Barcelona" }, away: { name: "PSG" } },
    league: { name: "UEFA Champions League" },
  },
];

const MOCK_STANDINGS = [
  { rank: 1, team: { name: "Manchester City" }, all: { played: 28, win: 20, draw: 5, lose: 3 }, points: 65 },
  { rank: 2, team: { name: "Liverpool" }, all: { played: 28, win: 19, draw: 7, lose: 2 }, points: 64 },
  { rank: 3, team: { name: "Arsenal" }, all: { played: 28, win: 20, draw: 4, lose: 4 }, points: 64 },
];

// --- API CONFIG ---
const API_HOST = "https://free-live-football-data.p.rapidapi.com";
const API_KEY = "ca40867772msh8de203fa2090f5fp123cbajsn95fa7e6712ce";

const HEADERS = {
  "x-rapidapi-host": "free-live-football-data.p.rapidapi.com",
  "x-rapidapi-key": API_KEY,
};

async function fetchAPI(endpoint) {
  const response = await fetch(`${API_HOST}${endpoint}`, { headers: HEADERS });
  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (!response.ok) throw new Error("API_ERROR");
  return response.json();
}

function Spinner() {
  return <div className="spinner"><div className="lds-dual-ring"></div></div>;
}

function ErrorFallback({ message }) {
  return <div className="error-fallback"><span>⚠️ {message}</span></div>;
}

function EmptyState({ message }) {
  return <div className="empty-state"><span>{message}</span></div>;
}

function Navbar({ onLive, onFixtures }) {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="electric-blue">FOOTBALL</span>
        <span className="gold-gradient">LIVE</span>
      </div>
      <div className="navbar-actions">
        <button className="nav-btn" onClick={onLive}>Live Matches</button>
        <button className="nav-btn secondary" onClick={onFixtures}>Today's Fixtures</button>
      </div>
    </nav>
  );
}

function Hero({ onLive, onFixtures }) {
  return (
    <section className="hero glass hero-institutional">
      <div className="hero-content">
        <h1 className="hero-title">Real-Time Football Dashboard</h1>
        <p className="hero-desc">Live scores and fixtures. Fallback enabled for reliability.</p>
        <div className="hero-cta">
          <button className="cta-btn" onClick={onLive}>View Live Matches</button>
          <button className="cta-btn secondary" onClick={onFixtures}>Today's Fixtures</button>
        </div>
      </div>
    </section>
  );
}

function MatchCard({ match }) {
  const { teams, goals, fixture, league } = match;
  return (
    <div className="card match-card glass">
      <div className="match-header">
        <div className="teams">
          <span className="team-name electric-blue">{teams.home.name}</span>
          <span className="vs">vs</span>
          <span className="team-name gold-gradient">{teams.away.name}</span>
        </div>
        <div className="score electric-blue">{goals?.home ?? 0} - {goals?.away ?? 0}</div>
        <div className="match-meta">
          <span className="live-dot"></span>
          <span>{fixture.status.short} {fixture.status.elapsed ? `· ${fixture.status.elapsed}'` : ""}</span>
        </div>
        <div className="league-meta">{league.name}</div>
      </div>
    </div>
  );
}

function FixtureCard({ fixture }) {
  const { teams, fixture: fx, league } = fixture;
  return (
    <div className="card match-card glass">
      <div className="match-header">
        <div className="teams">
          <span className="team-name electric-blue">{teams.home.name}</span>
          <span className="vs">vs</span>
          <span className="team-name gold-gradient">{teams.away.name}</span>
        </div>
        <div className="fixture-time">
          {new Date(fx.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="league-meta">{league.name}</div>
      </div>
    </div>
  );
}

function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return <EmptyState message="No standings data." />;
  return (
    <div className="table-wrapper glass">
      <table className="league-table">
        <thead>
          <tr><th>Pos</th><th>Team</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => (
            <tr key={row.team?.id || idx}>
              <td>{row.rank}</td>
              <td>{row.team.name}</td>
              <td>{row.all.played}</td>
              <td>{row.all.win}</td>
              <td>{row.all.draw}</td>
              <td>{row.all.lose}</td>
              <td>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [view, setView] = useState("live");
  const [live, setLive] = useState({ loading: true, error: null, data: [] });
  const [fixtures, setFixtures] = useState({ loading: true, error: null, data: [] });
  const [standings, setStandings] = useState({ loading: true, error: null, data: [] });
  
  const hasFetched = useRef(false);

  const fetchData = useCallback(async () => {
    // Live Matches
    try {
      const d = await fetchAPI("/livescores");
      setLive({ loading: false, error: null, data: d.response || [] });
    } catch (e) {
      setLive({ loading: false, error: "Using Mock Data (API Limit)", data: MOCK_LIVE_MATCHES });
    }

    // Fixtures
    try {
      const d = await fetchAPI("/fixtures");
      setFixtures({ loading: false, error: null, data: d.response || [] });
    } catch (e) {
      setFixtures({ loading: false, error: "Using Mock Data (API Limit)", data: MOCK_FIXTURES });
    }

    // Standings (Using /leagues as a proxy or mock if specific standings endpoint unavailable)
    try {
      const d = await fetchAPI("/leagues");
      // If the free API doesn't provide full standings in /leagues, we use mock
      setStandings({ loading: false, error: null, data: MOCK_STANDINGS });
    } catch (e) {
      setStandings({ loading: false, error: null, data: MOCK_STANDINGS });
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute to save quota
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="dashboard institutional-bg">
      <Navbar onLive={() => setView("live")} onFixtures={() => setView("fixtures")} />
      <Hero onLive={() => setView("live")} onFixtures={() => setView("fixtures")} />

      <main>
        {view === "live" && (
          <section className="section">
            <h2 className="section-title">Live Matches {live.error && <small style={{fontSize: '0.5em', color: '#aaa'}}>(Demo Mode)</small>}</h2>
            {live.loading ? <Spinner /> : (
              <div className="cards-row">
                {live.data.length > 0 ? live.data.map((m) => <MatchCard key={m.fixture.id} match={m} />) : <EmptyState message="No live matches." />}
              </div>
            )}
          </section>
        )}

        {view === "fixtures" && (
          <section className="section">
            <h2 className="section-title">Today's Fixtures {fixtures.error && <small style={{fontSize: '0.5em', color: '#aaa'}}>(Demo Mode)</small>}</h2>
            {fixtures.loading ? <Spinner /> : (
              <div className="cards-row">
                {fixtures.data.length > 0 ? fixtures.data.map((f) => <FixtureCard key={f.fixture.id} fixture={f} />) : <EmptyState message="No fixtures." />}
              </div>
            )}
          </section>
        )}

        <section className="section">
          <h2 className="section-title">League Standings</h2>
          {standings.loading ? <Spinner /> : <StandingsTable standings={standings.data} />}
        </section>
      </main>

      <footer className="footer">
        <span>&copy; {new Date().getFullYear()} FootballLive. Data provided by RapidAPI.</span>
      </footer>
    </div>
  );
}

export default App;
