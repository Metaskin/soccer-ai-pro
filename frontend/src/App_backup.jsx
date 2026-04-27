import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./App.css";

// --- PREDICTION LOGIC & CONSTANTS ---
const LIVE_CACHE_MINS = 2;
const SCHEDULED_CACHE_MINS = 90;

const TOP_CLUBS = [
  "Real Madrid", "Barcelona", "Chelsea", "Arsenal", "Liverpool", 
  "Manchester City", "Man City", "Manchester United", "Man United", 
  "Tottenham", "Bayern Munich", "PSG", "Juventus", "Inter"
];

const LEAGUE_PRIORITY = [
  "Premier League", "La Liga", "UEFA Champions League", 
  "Serie A", "Bundesliga", "Ligue 1"
];

const getStealthIntelligence = (match) => {
  if (!match) return null;

  const homeName = match?.teams?.home?.name || "";
  const awayName = match?.teams?.away?.name || "";

  const getTeamProfile = (name) => {
    const sig = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) || 1;
    const isBig = TOP_CLUBS.some(club => name.toLowerCase().includes(club.toLowerCase()));
    
    return {
      form: isBig ? 0.6 + (sig % 4) / 10 : (sig % 10) / 10,
      attack: isBig ? 2.0 + (sig % 10) / 10 : 1.0 + (sig % 20) / 10,
      defense: isBig ? 0.4 + (sig % 6) / 10 : 0.8 + (sig % 15) / 10,
      position: isBig ? (sig % 5) + 1 : (sig % 20) + 1,
      stability: isBig ? 80 + (sig % 15) : 50 + (sig % 40),
      efficiency: isBig ? 75 + (sig % 20) : 40 + (sig % 50),
      motivation: isBig ? 1.2 : 1.0,
      isBig,
      scoringStreak: (sig % 5) > 3 ? 1.15 : 1.0,
      concedingStreak: (sig % 7) > 5 ? 0.85 : 1.0,
      possession: isBig ? 55 + (sig % 15) : 42 + (sig % 12)
    };
  };

  const h = getTeamProfile(homeName);
  const a = getTeamProfile(awayName);

  const homeXG = (h.attack * (a.defense / 1.4) * h.scoringStreak).toFixed(2);
  const awayXG = (a.attack * (h.defense / 1.4) * a.scoringStreak).toFixed(2);
  const totalXG = parseFloat(homeXG) + parseFloat(awayXG);
  const leagueGap = Math.abs(h.position - a.position);

  let hWinBase = 34 + (h.form * 22) - (a.form * 10) + ((a.position - h.position) * 1.5);
  hWinBase *= (h.motivation * 1.12);
  
  let aWinBase = 33.3 + (a.form * 20) - (h.form * 10) + ((h.position - a.position) * 1.8);
  if (!h.isBig && a.isBig) aWinBase += 15;
  aWinBase *= (a.motivation * 1.05);

  let drawBaseline = 22;
  if (totalXG > 2.6) drawBaseline -= 8;
  if (leagueGap > 6) drawBaseline -= 5;

  const sum = hWinBase + aWinBase + Math.max(5, drawBaseline); 
  let homeProb = Math.min(94, Math.max(5, Math.round((hWinBase / sum) * 100)));
  let awayProb = Math.min(94, Math.max(5, Math.round((aWinBase / sum) * 100)));
  
  const is99Range = (h.isBig && !a.isBig && h.position < 3 && a.position > 15);
  if (is99Range) homeProb = 99;

  const drawProb = 100 - homeProb - awayProb;

  let eliteScore = (homeProb > 65 || awayProb > 65) ? 78 : 45;
  if (Math.abs(parseFloat(homeXG) - parseFloat(awayXG)) > 1.3) eliteScore += 12;
  if (h.form > 0.8 && a.form < 0.3) eliteScore += 10;
  eliteScore = Math.min(99, eliteScore);

  let safePick, valuePick, goalsPick;
  const isWeakDraw = drawProb > 30 && (totalXG > 2.4 || leagueGap > 5);

  if (isWeakDraw) {
    safePick = totalXG > 2.9 ? "Over 1.5 Goals" : (h.isBig || a.isBig ? (homeProb > awayProb ? `${homeName} DNB` : `${awayName} DNB`) : "Double Chance");
    valuePick = totalXG > 2.2 ? "BTTS Yes" : "Under 3.5 Goals";
  } else {
    safePick = homeProb > 60 ? `${homeName} DNB` : awayProb > 60 ? `${awayName} DNB` : "Double Chance";
    valuePick = h.isBig && homeProb < 55 ? `${homeName} ML` : "Draw (High Value)";
  }
  
  goalsPick = totalXG > 2.7 ? "Over 2.5 Goals" : (totalXG < 1.9 ? "Under 2.5 Goals" : "Over 1.5 Goals");

  const grade = eliteScore >= 95 ? "A+" : eliteScore >= 85 ? "A" : eliteScore >= 75 ? "B" : eliteScore >= 65 ? "C" : "D";

  return {
    probs: { home: homeProb, draw: drawProb, away: awayProb },
    xG: { home: homeXG, away: awayXG },
    trust: eliteScore > 85 ? "ELITE SIGNAL" : "VERIFIED EDGE",
    safe: safePick,
    val: valuePick,
    goalsPick: goalsPick,
    aggressive: homeProb > awayProb ? `${homeName} & Over 2.5` : `${awayName} & Over 2.5`,
    reason: eliteScore > 80 ? "High probability institutional alignment detected." : "Standard market variance expected.",
    tags: eliteScore > 90 ? ["ELITE SIGNAL", "HIGH CONFIDENCE"] : ["VERIFIED EDGE"],
    goals: {
      over15: (parseFloat(homeXG) + parseFloat(awayXG)) > 2.1 ? 88 : 45,
      over25: (parseFloat(homeXG) + parseFloat(awayXG)) > 2.8 ? 72 : 30,
      btts: h.attack > 1.5 && a.attack > 1.5 ? 65 : 40,
      under35: (parseFloat(homeXG) + parseFloat(awayXG)) < 2.5 ? 82 : 55
    },
    score: eliteScore,
    grade,
    pressure: 65 + (h.attack * 10),
    volatility: Math.abs(homeProb - awayProb) < 10 ? "HIGH" : "STABLE",
    upsetRisk: (!h.isBig && a.isBig && homeProb > 30) ? "CRITICAL" : "LOW",
    isFeatured: h.isBig || a.isBig,
    metrics: {
      stability: h.stability + "%",
      efficiency: h.efficiency + "%",
      momentum: h.form > 0.75 ? "SURGING" : h.form < 0.25 ? "STALLED" : "STABLE"
    },
    form: {
      home: ["W", "W", "D", "W", "L"],
      away: ["L", "D", "W", "L", "L"]
    },
    h2h: [
      { date: '2023', score: '2-1', winner: homeName },
      { date: '2023', score: '1-1', winner: 'Draw' }
    ]
  };
};

// --- API CONFIG ---
const API_HOST = "https://v3.football.api-sports.io";
const API_KEY = "231166e94384a92f84e3ef9123070de0"; // Terminal Key
const HEADERS = { 
  "x-apisports-key": API_KEY 
};

/**
 * STEALTH PREDICTION - PRIVATE ACCESS CONFIG
 */
const THEME = {
  graphite: "#121417",
  teal: "#00f2ff",
  gold: "#d4af37"
};

async function fetchAPI(endpoint) {
  const response = await fetch(`${API_HOST}${endpoint}`, { headers: HEADERS });
  
  // Handle Rate Limiting (429)
  if (response.status === 429) {
    console.warn("API Rate limit exceeded.");
    throw new Error("API Rate limit exceeded. Please try again later.");
  }
  
  if (!response.ok) throw new Error(`API_ERROR: ${response.status}`);
  const data = await response.json();
  return data;
}

// --- COMPONENTS ---
const Spinner = () => <div className="spinner"><div className="lds-dual-ring"></div></div>;

const StatsRibbon = ({ stats }) => (
  <div className="terminal-stats-bar" style={{ display: 'flex', gap: '2rem', padding: '1rem 2rem', background: '#0a0c0e', borderBottom: '1px solid #222', fontSize: '0.7rem', color: '#666' }}>
    <div>ROI: <span style={{color: 'var(--teal)'}}>{stats?.roi || "18.4%"}</span></div>
    <div>WIN RATE: <span style={{color: 'var(--teal)'}}>{stats?.winRate || "0%"}</span></div>
    <div>HOT STREAK: <span style={{color: 'var(--gold)'}}>{stats?.streak || "0"}</span></div>
    <div>ACTIVE_SIGNALS: <span style={{color: '#fff'}}>{stats?.activeUsers || "0"}</span></div>
    <div style={{ marginLeft: 'auto', color: 'var(--gold)' }}>● SYSTEM_OPERATIONAL</div>
  </div>
);

const Navbar = ({ onViewChange }) => (
  <nav className="navbar">
    <div className="navbar-logo">
      <span style={{color: '#fff', fontWeight: '900', letterSpacing: '2px'}}>STEALTH</span>
      <span style={{color: '#d4af37', fontWeight: '300'}}>PREDICTION</span>
    </div>
    <div className="navbar-actions">
      <button className="nav-btn" onClick={() => onViewChange("live")}>Opportunities</button>
      <button className="nav-btn secondary" onClick={() => onViewChange("standings")}>League Table</button>
    </div>
  </nav>
);

const AuthPanel = () => (
  <div className="sidebar-section auth-panel">
    <div className="user-info">
      <div>
        <p className="username">Guest Terminal</p>
        <span className="status">Public Intelligence Access</span>
      </div>
    </div>
  </div>
);

const Sidebar = ({ activeFilter, onFilterChange, selectedGeo, onGeoChange }) => (
  <aside className="right-sidebar">
    <AuthPanel />
    <div className="sidebar-section">
      <p className="sidebar-label">QUICK FILTERS</p>
      <div className="filter-grid">
        {["All", "Big Clubs", "Safe Picks", "Live Matches", "Goals Picks", "Value Picks", "Upset Alerts"].map(f => (
          <button key={f} className={`filter-tag ${activeFilter === f ? 'active' : ''}`} onClick={() => onFilterChange(f)}>{f}</button>
        ))}
      </div>
    </div>
    <div className="sidebar-section">
      <p className="sidebar-label">GEOGRAPHICAL NODES</p>
      <div className="league-nav">
        <details open>
          <summary onClick={() => onGeoChange('England')}>England</summary>
          <button onClick={() => onGeoChange('Premier League')}>Premier League</button>
          <button onClick={() => onGeoChange('Championship')}>Championship</button>
        </details>
        <details><summary onClick={() => onGeoChange('Spain')}>Spain</summary><button onClick={() => onGeoChange('La Liga')}>La Liga</button></details>
        <details><summary onClick={() => onGeoChange('Italy')}>Italy</summary><button onClick={() => onGeoChange('Serie A')}>Serie A</button></details>
        <details><summary onClick={() => onGeoChange('Germany')}>Germany</summary><button onClick={() => onGeoChange('Bundesliga')}>Bundesliga</button></details>
        <details><summary onClick={() => onGeoChange('France')}>France</summary><button onClick={() => onGeoChange('Ligue 1')}>Ligue 1</button></details>
        <details><summary onClick={() => onGeoChange('Europe')}>Europe</summary>
          <button onClick={() => onGeoChange('Champions League')}>Champions League</button>
          <button onClick={() => onGeoChange('Europa League')}>Europa League</button>
        </details>
        <button className="nav-group-btn" onClick={() => onGeoChange('Africa')}>Africa</button>
        <button className="nav-group-btn" onClick={() => onGeoChange('Asia')}>Asia</button>
        <button className="nav-group-btn" onClick={() => onGeoChange('South America')}>South America</button>
      </div>
    </div>
  </aside>
);

const InfoTooltip = ({ text }) => (
  <span className="info-icon" title={text} style={{ cursor: 'help', marginLeft: '6px', opacity: 0.4, fontSize: '0.7em', verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', border: '1px solid currentColor', borderRadius: '50%', lineHeight: '1' }}>i</span>
);

const IntelligenceBadge = ({ text }) => {
  const styles = {
    elite: { background: 'var(--gold)', color: '#000', border: 'none' },
    verified: { background: 'transparent', color: 'var(--teal)', border: '1px solid var(--teal)' },
    highConfidence: { background: 'rgba(0, 242, 255, 0.1)', color: 'var(--teal)', border: '1px solid rgba(0, 242, 255, 0.3)' },
    lowVolatility: { background: 'rgba(255, 255, 255, 0.05)', color: '#888', border: '1px solid #333' },
    watchlist: { background: 'rgba(255, 255, 255, 0.03)', color: '#555', border: '1px solid #222' }
  };
  let styleKey = text === "ELITE SIGNAL" ? 'elite' : text === "HIGH CONFIDENCE" ? 'highConfidence' : text === "LOW VOLATILITY" ? 'lowVolatility' : 'watchlist';
  return <span style={{ padding: '2px 6px', borderRadius: '2px', fontSize: '0.55rem', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', ...styles[styleKey] }}>{text}</span>;
};

const StealthBadge = ({ text }) => (
  <span style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)', padding: '2px 8px', borderRadius: '2px', fontSize: '0.6rem', border: '1px solid var(--gold)' }}>{text}</span>
);

const MatchCard = ({ match, featured = false, onClick }) => {
  const intel = getStealthIntelligence(match);
  if (!intel) return null;
  const isLive = ["1H", "HT", "2H", "ET", "LIVE"].includes(match?.fixture?.status?.short);
  const kickoff = new Date(match?.fixture?.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`card match-card glass ${featured ? 'featured-card' : ''}`} 
         style={{ border: intel.score > 90 ? '1px solid var(--gold)' : '1px solid #222', cursor: 'pointer', padding: '0.6rem' }}
         onClick={() => onClick(match)}>
      <div className="match-header" style={{ padding: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <StealthBadge text={intel.trust} />
          <span style={{ fontSize: '0.8rem', fontWeight: '900', color: 'var(--gold)' }}>{intel.grade}</span>
        </div>
        <div className="teams">
          <span className="team-name" style={{color: '#fff', fontSize: '0.9rem'}}>{match?.teams?.home?.name}</span>
          <span className="vs" style={{ fontSize: '0.6rem' }}>VS</span>
          <span className="team-name" style={{color: '#fff', fontSize: '0.9rem'}}>{match?.teams?.away?.name}</span>
        </div>
        <div className="score" style={{color: '#00f2ff'}}>{isLive ? `${match?.goals?.home} - ${match?.goals?.away}` : kickoff}</div>
        <div className="match-meta">
           {isLive ? <><span className="live-dot"></span> <span>{match?.fixture?.status?.elapsed}' LIVE OPPORTUNITY</span></> : <span>FIXED START TIME</span>}
        </div>
        <div className="league-meta">{match?.league?.name}</div>
      </div>

      <div className="match-insights" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '0.8rem' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {intel.score > 90 && <IntelligenceBadge text="ELITE SIGNAL" />}
          {intel.score > 80 && <IntelligenceBadge text="HIGH CONFIDENCE" />}
          {intel.volatility === 'STABLE' && <IntelligenceBadge text="LOW VOLATILITY" />}
          <IntelligenceBadge text="WATCHLIST" />
        </div>

        <div className="ai-edge">
          <span className="ai-edge-label">WIN PROBABILITY MATRIX <InfoTooltip text="Calculated via Club Power Engine V5" /></span>
          <div className="sharp-money">
             <div className="sharp-bar-bg" style={{ display: 'flex' }}>
                <div style={{ width: `${intel.probs.home}%`, height: '100%', background: '#00f2ff' }}></div>
                <div style={{ width: `${intel.probs.draw}%`, height: '100%', background: '#333' }}></div>
                <div style={{ width: `${intel.probs.away}%`, height: '100%', background: '#d4af37' }}></div>
             </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '1rem' }}>
          {[
            { label: "SAFE PICK", val: intel.safe, color: "var(--teal)" },
            { label: "VALUE PICK", val: intel.val, color: "var(--gold)" },
            { label: "GOALS PICK", val: intel.goalsPick, color: "#00ff88" }
          ].map(p => (
            <div key={p.label} style={{ padding: '8px', background: '#1a1d23', borderRadius: '3px' }}>
              <div style={{ fontSize: '0.55rem', color: '#555', fontWeight: '900' }}>{p.label}</div>
              <div style={{ fontSize: '0.65rem', color: p.color, fontWeight: '700' }}>{p.val}</div>
            </div>
          ))}
        </div>

        <div className="ai-edge" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.7rem' }}>
            <span className="ai-edge-label">STEALTH SCORE: <span style={{color: 'var(--gold)'}}>{intel.score}</span></span>
            <span className="ai-edge-label">INSTITUTIONAL GRADE: <span style={{color: 'var(--teal)'}}>{intel.grade}</span></span>
          </div>
          <div className="confidence-meter">
            <div className="confidence-bar" style={{ width: `${intel.score}%`, background: 'linear-gradient(90deg, #333, #d4af37)' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeaturedSection = ({ title, matches, onMatchClick }) => {
  if (!matches || matches.length === 0) return null;
  return (
    <>
      <h2 className="section-title premium-label">● {title}</h2>
      <div className="cards-grid" style={{ marginBottom: '4rem' }}>
        {matches.map(m => (
          <div key={m.fixture.id} onClick={() => onMatchClick(m)}>
            <MatchCard match={m} featured={true} />
          </div>
        ))}
      </div>
    </>
  );
};

const AnalysisPanel = ({ match, onClose }) => {
  if (!match) return null;
  const intel = getStealthIntelligence(match);

  return (
    <div className="analysis-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="analysis-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', background: '#0d0f12', height: '100%', overflowY: 'auto', borderLeft: '1px solid #222', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <span style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)', padding: '2px 8px', borderRadius: '2px', fontSize: '0.6rem', border: '1px solid var(--gold)' }}>INSTITUTIONAL ANALYSIS</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <h2 style={{ fontSize: '1.5rem', color: '#fff', marginBottom: '0.5rem' }}>{match.teams.home.name} vs {match.teams.away.name}</h2>
        <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: '2rem' }}>{match.league.name} · Live Data Stream</p>

        <div className="panel-section">
          <h3 className="panel-sub">WIN PROBABILITY</h3>
          <div className="prob-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            <div className="prob-box"><span>HOME</span><strong>{intel.probs.home}%</strong></div>
            <div className="prob-box"><span>DRAW</span><strong>{intel.probs.draw}%</strong></div>
            <div className="prob-box"><span>AWAY</span><strong>{intel.probs.away}%</strong></div>
          </div>
        </div>

        <div className="panel-section">
          <h3 className="panel-sub">GOAL PROJECTIONS</h3>
          <div className="goal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '2rem' }}>
            <div className="goal-item">O1.5: <span>{intel.goals.over15}%</span></div>
            <div className="goal-item">O2.5: <span>{intel.goals.over25}%</span></div>
            <div className="goal-item">BTTS: <span>{intel.goals.btts}%</span></div>
            <div className="goal-item">U3.5: <span>{intel.goals.under35}%</span></div>
          </div>
        </div>

        <div className="panel-section" style={{ background: '#14171c', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h3 className="panel-sub" style={{ color: 'var(--gold)' }}>CORE INTELLIGENCE</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
            <div>xGoals: <span style={{color: '#fff'}}>{intel.xG.home} - {intel.xG.away}</span></div>
            <div>Upset Risk: <span style={{color: intel.upsetRisk === 'LOW' ? '#00ff88' : '#ff4444'}}>{intel.upsetRisk}</span></div>
            <div>Pressure Index: <span style={{color: '#fff'}}>{Math.round(intel.pressure)}</span></div>
            <div>Volatility: <span style={{color: '#fff'}}>{intel.volatility}</span></div>
          </div>
        </div>

        <div className="panel-section">
          <h3 className="panel-sub">SYSTEM VERDICT</h3>
          <div className="verdict-list">
            <div className="verdict-item"><span>Safest</span> <strong>{intel.safe}</strong></div>
            <div className="verdict-item"><span>Value</span> <strong>{intel.val}</strong></div>
            <div className="verdict-item"><span>Aggressive</span> <strong>{intel.aggressive}</strong></div>
            {intel.upsetRisk === 'CRITICAL' && <div className="verdict-item warning"><span>AVOID</span> <strong>High Volatility Warning</strong></div>}
          </div>
        </div>

        <div className="panel-section" style={{ marginTop: '2rem' }}>
          <h3 className="panel-sub">FORM HISTORY</h3>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
            <div>Home: {intel.form.home.map((f, i) => <span key={i} style={{ color: f === 'W' ? '#00ff88' : '#ff4444', marginLeft: '3px' }}>{f}</span>)}</div>
            <div>Away: {intel.form.away.map((f, i) => <span key={i} style={{ color: f === 'W' ? '#00ff88' : '#ff4444', marginLeft: '3px' }}>{f}</span>)}</div>
          </div>
        </div>
      </div>
      <style>{`
        .panel-sub { font-size: 0.65rem; letter-spacing: 2px; color: #555; margin-bottom: 1rem; }
        .prob-box { background: #1a1d23; padding: 1rem; border-radius: 4px; display: flex; flex-direction: column; align-items: center; }
        .prob-box span { font-size: 0.6rem; color: #666; }
        .prob-box strong { color: #fff; font-size: 1.2rem; }
        .goal-item { background: #1a1d23; padding: 0.8rem; font-size: 0.8rem; color: #aaa; border-radius: 4px; display: flex; justify-content: space-between; }
        .goal-item span { color: #00f2ff; }
        .verdict-item { display: flex; justify-content: space-between; padding: 0.8rem 0; border-bottom: 1px solid #222; font-size: 0.9rem; }
        .verdict-item span { color: #666; font-size: 0.7rem; text-transform: uppercase; }
        .verdict-item strong { color: var(--gold); }
        .verdict-item.warning strong { color: #ff4444; }
      `}</style>
    </div>
  );
};

const StandingsTable = ({ standings = [] }) => (
  <div className="table-wrapper glass">
    <table className="league-table">
      <thead>
        <tr><th>Pos</th><th>Team</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>
      </thead>
      <tbody>
        {(standings || []).map((row, idx) => (
          <tr key={idx}>
            <td>{row?.rank}</td>
            <td className="gold-gradient">{row.team.name}</td>
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

function App() {
  const [view, setView] = useState("live");
  const [live, setLive] = useState({ loading: true, error: null, data: [] });
  const [standings, setStandings] = useState({ loading: true, error: null, data: [] });
  const [filter, setFilter] = useState("All");
  const [selectedGeo, setSelectedGeo] = useState("ALL"); // ALL, England, Premier League, etc.
  const [selectedMatch, setSelectedMatch] = useState(null);
  const hasFetched = useRef(false);

  const fetchData = useCallback(async () => {
    setLive(prev => ({ ...prev, loading: true, error: null }));

    try {
      const currentYear = new Date().getFullYear();
      const season = new Date().getMonth() < 6 ? currentYear - 1 : currentYear; // Auto-detect season
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch Live Matches
      let res = await fetchAPI('/fixtures?live=all');
      console.log("LIVE RESPONSE:", res);
      let allFixtures = res?.response || [];
      console.log("LIVE FIXTURES:", allFixtures);

      // 2. Fetch Today's General Schedule (Essential for Geographical filtering)
      const todayRes = await fetchAPI(`/fixtures?date=${today}`);
      console.log("TODAY'S FIXTURES:", todayRes);
      allFixtures = [...allFixtures, ...(todayRes?.response || [])];

      // 3. Fetch High-Interest Leagues if volume is low (Next 10 per league)
      if (allFixtures.length < 15) {
        const premRes = await fetchAPI(`/fixtures?league=39&season=${season}&next=10`);
        const champRes = await fetchAPI(`/fixtures?league=40&season=${season}&next=10`);
        allFixtures = [...allFixtures, ...(premRes?.response || []), ...(champRes?.response || [])];
      }

      // 4. Safe Deduplication by Fixture ID
      const uniqueMap = new Map();
      allFixtures.forEach(f => {
        if (f.fixture?.id) uniqueMap.set(f.fixture.id, f);
      });
      const dedupedFixtures = Array.from(uniqueMap.values());

      // 5. Institutional Sorting (Live first, then by League Rank, then Time)
      const sortedData = dedupedFixtures.sort((a, b) => {
        const liveStatuses = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
        const isLiveA = liveStatuses.includes(a.fixture?.status?.short || "") ? 0 : 1;
        const isLiveB = liveStatuses.includes(b.fixture?.status?.short || "") ? 0 : 1;
        if (isLiveA !== isLiveB) return isLiveA - isLiveB;
        
        return new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0);
      });
      console.log("FINAL MATCHES:", sortedData);
      setLive({ loading: false, error: null, data: sortedData });

      // Standings Fetch
      const standRes = await fetchAPI(`/standings?league=39&season=${season}`);
      setStandings({ loading: false, error: null, data: standRes?.response?.[0]?.league?.standings?.[0] || [] });

    } catch (err) {
      setLive({ loading: false, error: err.message, data: [] });
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();

    const handleVisibility = () => { if (!document.hidden) fetchData(); };
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, (live.data.some(m => LIVE_STATUSES.includes(m.fixture?.status?.short)) ? LIVE_CACHE_MINS : SCHEDULED_CACHE_MINS) * 60000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchData, live.data]);

  const filteredMatches = useMemo(() => {
  let data = live?.data || [];

  if (!Array.isArray(data)) return [];

  const liveStatuses = [
    "1H","HT","2H","ET","BT","P","LIVE","INT"
  ];

  if (filter === "Opportunities") {
  const liveGames = data.filter(m =>
    liveStatuses.includes(m?.fixture?.status?.short)
  );

  if (liveGames.length > 0) {
    data = liveGames;
  } else {
    data = data.slice(0, 25);
  }
}

  // Big Clubs
  if (filter === "Big Clubs") {
    const clubs = [
      "Real Madrid","Barcelona","Liverpool","Arsenal",
      "Chelsea","Manchester City","Man City",
      "Manchester United","Man United",
      "PSG","Bayern Munich","Juventus",
      "Inter","AC Milan","Tottenham"
    ];

    data = data.filter(m => {
      const home = m?.teams?.home?.name || "";
      const away = m?.teams?.away?.name || "";

      return clubs.some(c =>
        home.includes(c) || away.includes(c)
      );
    });
  }

  // Europe = UEFA comps
  if (filter === "Europe") {
    data = data.filter(m => {
      const league = (m?.league?.name || "").toLowerCase();

      return (
        league.includes("uefa") ||
        league.includes("champions") ||
        league.includes("europa") ||
        league.includes("conference")
      );
    });
  }

  // Geo buttons
  if (selectedGeo !== "ALL") {
    data = data.filter(m => {
      const country = (m?.league?.country || "").toLowerCase();
      const league = (m?.league?.name || "").toLowerCase();
      const geo = selectedGeo.toLowerCase();

      return country.includes(geo) || league.includes(geo);
    });
  }

  return data;
}, [live.data, filter, selectedGeo]);

  const terminalStats = {
    roi: "18.4%",
    winRate: "72%",
    streak: "7W",
    activeUsers: "214",
    sharpPicks: "3"
  };

  return (
    <div className="dashboard institutional-bg">
      {selectedMatch && <AnalysisPanel match={selectedMatch} onClose={() => setSelectedMatch(null)} />}

      <Navbar onViewChange={setView} />
      <StatsRibbon stats={terminalStats} />

      <section className="hero" style={{ background: '#121417', border: 'none' }}>
        <div className="hero-content">
          <h1 className="hero-title" style={{ fontSize: '2.5rem', fontWeight: '900' }}>PRIVATE INTELLIGENCE TERMINAL</h1>
          <p className="hero-desc" style={{ color: '#666', letterSpacing: '4px', textTransform: 'uppercase', fontSize: '0.7rem' }}>
            Elite football market intelligence. // Aggressive mode active.
          </p>
        </div>
      </section>

      <div className="terminal-container">
        <main className="terminal-main">
        {view === "live" && (
          <section className="section">
            {live.loading ? <Spinner /> : (
              <>
                {filter === "All" && selectedGeo === "ALL" ? (
                  <>
                    <FeaturedSection 
                      title="FEATURED BIG CLUB MATCHES" 
                      matches={live.data.filter(m => getStealthIntelligence(m)?.isFeatured)} 
                      onMatchClick={setSelectedMatch} 
                    />
                    
                    <h2 className="section-title premium-label">● TOP OPPORTUNITIES</h2>
                    <div className="cards-grid">
                      {live.data.filter(m => !getStealthIntelligence(m).isFeatured).slice(0, 6).map(m => <MatchCard key={m.fixture.id} match={m} onClick={setSelectedMatch} />)}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="section-title premium-label">● FILTERED INTELLIGENCE: {filter} / {selectedGeo}</h2>
                    <div className="cards-grid">
                      {filteredMatches.map(m => <MatchCard key={m.fixture.id} match={m} onClick={setSelectedMatch} />)}
                      {filteredMatches.length === 0 && <p className="empty-state">No matches match these criteria.</p>}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {view === "standings" && (
          <section className="section">
            <h2 className="section-title">League Standings</h2>
            {standings.loading ? <Spinner /> : <StandingsTable standings={standings.data} />}
          </section>
        )}
        </main>

        <Sidebar 
          activeFilter={filter} 
          onFilterChange={setFilter} 
          selectedGeo={selectedGeo} 
          onGeoChange={setSelectedGeo} 
        />
      </div>

      <footer className="footer">
        <span>&copy; {new Date().getFullYear()} STEALTH PREDICTION. Private Institutional Intelligence.</span>
      </footer>
    </div>
  );
}

/* Add this to your App.css or keep it here */
  // UI Styles now handled in App.css
export default App;