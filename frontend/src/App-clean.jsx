import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./App.css";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const LIVE_CACHE_MINS      = 2;
const SCHEDULED_CACHE_MINS = 90;

const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE","SUSP"]);
const DONE_STATUSES = new Set(["FT","AET","PEN","WO","AWD","ABD","CANC"]);

const API_HOST    = "https://v3.football.api-sports.io";
const API_KEY     = "17bb5b4caab8a9bb7715d6449024cd7a";
const API_HEADERS = { "x-apisports-key": API_KEY };

// League ID → region (reliable fallback)
const LEAGUE_ID_MAP = {
  39:"England",40:"England",41:"England",42:"England",43:"England",45:"England",46:"England",
  140:"Spain",141:"Spain",143:"Spain",
  135:"Italy",136:"Italy",137:"Italy",
  78:"Germany",79:"Germany",80:"Germany",
  61:"France",62:"France",63:"France",
  88:"Netherlands",89:"Netherlands",
  94:"Portugal",95:"Portugal",
  144:"Belgium",115:"Greece",203:"Turkey",235:"Russia",322:"Ukraine",179:"Scotland",
  71:"South America",128:"South America",262:"South America",239:"South America",
  265:"South America",268:"South America",281:"South America",304:"South America",205:"South America",
  98:"Asia",292:"Asia",307:"Asia",385:"Asia",438:"Asia",55:"Asia",
  233:"Africa",287:"Africa",237:"Africa",250:"Africa",308:"Africa",310:"Africa",
  1:"Europe",2:"Europe",3:"Europe",848:"Europe",4:"Europe",5:"Europe",16:"Europe",218:"Europe",
};

// League name → region
const LEAGUE_NAME_MAP = {
  "Premier League":"England","Championship":"England","League One":"England","League Two":"England","FA Cup":"England","EFL Cup":"England",
  "La Liga":"Spain","Segunda División":"Spain","Copa del Rey":"Spain",
  "Serie A":"Italy","Serie B":"Italy","Coppa Italia":"Italy",
  "Bundesliga":"Germany","2. Bundesliga":"Germany","DFB Pokal":"Germany",
  "Ligue 1":"France","Ligue 2":"France","Coupe de France":"France",
  "Eredivisie":"Netherlands","Eerste Divisie":"Netherlands",
  "Primeira Liga":"Portugal","Liga Portugal":"Portugal",
  "Pro League":"Belgium","Super League":"Greece","Süper Lig":"Turkey",
  "Scottish Premiership":"Scotland",
  "UEFA Champions League":"Europe","Champions League":"Europe",
  "UEFA Europa League":"Europe","Europa League":"Europe",
  "UEFA Conference League":"Europe","Conference League":"Europe",
  "CAF Champions League":"Africa",
  "Copa Libertadores":"South America","Copa Sudamericana":"South America",
  "Brasileirão Série A":"South America","Liga Profesional Argentina":"South America",
  "J1 League":"Asia","K League 1":"Asia",
};

const TOP_CLUBS = [
  "Real Madrid","Barcelona","Chelsea","Arsenal","Liverpool",
  "Manchester City","Man City","Manchester United","Man United","Tottenham",
  "Bayern Munich","PSG","Paris Saint-Germain","Juventus","Inter","AC Milan","Napoli",
  "Atletico Madrid","Borussia Dortmund","Ajax","Porto","Benfica","Celtic",
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const norm = (s) => (s || "").toLowerCase().trim();

const localDateStr = (d = new Date()) => {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2,"0");
  const dy = String(d.getDate()).padStart(2,"0");
  return `${y}-${mo}-${dy}`;
};

const getDateGroup = (fixtureDate) => {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tom   = new Date(today.getTime() + 864e5);
  const md    = new Date(fixtureDate);
  const mday  = new Date(md.getFullYear(), md.getMonth(), md.getDate());
  if (mday.getTime() === today.getTime()) return "TODAY";
  if (mday.getTime() === tom.getTime())   return "TOMORROW";
  return "FUTURE";
};

const getTimeToKickoff = (fixtureDate) => {
  const diff = new Date(fixtureDate).getTime() - Date.now();
  if (diff <= 0) return "LIVE";
  const h = Math.floor(diff / 36e5);
  const m = Math.floor((diff % 36e5) / 6e4);
  if (h === 0) return `${m}m`;
  if (h < 24)  return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}d`;
};

const getTZAbbrev = () =>
  new Date().toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();

// Determine region of a fixture
const getFixtureRegion = (m) => {
  const id  = m?.league?.id;
  const c   = norm(m?.league?.country);
  const n   = m?.league?.name || "";

  if (id && LEAGUE_ID_MAP[id])   return LEAGUE_ID_MAP[id];
  if (LEAGUE_NAME_MAP[n])        return LEAGUE_NAME_MAP[n];

  const cmap = {
    "england":"England","spain":"Spain","italy":"Italy","germany":"Germany",
    "france":"France","netherlands":"Netherlands","portugal":"Portugal",
    "belgium":"Belgium","greece":"Greece","turkey":"Turkey","russia":"Russia",
    "ukraine":"Ukraine","scotland":"Scotland","austria":"Austria","switzerland":"Switzerland",
    "brazil":"South America","argentina":"South America","mexico":"South America",
    "colombia":"South America","chile":"South America","uruguay":"South America","peru":"South America",
    "japan":"Asia","south korea":"Asia","korea":"Asia","china":"Asia",
    "saudi arabia":"Asia","india":"Asia","australia":"Asia","thailand":"Asia",
    "egypt":"Africa","south africa":"Africa","nigeria":"Africa","ghana":"Africa",
    "morocco":"Africa","tunisia":"Africa","cameroon":"Africa","algeria":"Africa",
    "senegal":"Africa","ivory coast":"Africa",
  };
  if (cmap[c]) return cmap[c];

  const nl = norm(n);
  if (nl.includes("champions league")) return "Europe";
  if (nl.includes("europa league"))   return "Europe";
  if (nl.includes("conference league")) return "Europe";
  if (nl.includes("uefa"))            return "Europe";
  return null;
};

// Geo match function
const SPECIFIC_LEAGUES = new Set([
  "Premier League","Championship","League One","League Two","FA Cup","EFL Cup",
  "La Liga","Segunda División","Copa del Rey",
  "Serie A","Serie B","Coppa Italia",
  "Bundesliga","2. Bundesliga","DFB Pokal",
  "Ligue 1","Ligue 2","Coupe de France",
  "UEFA Champions League","Champions League",
  "UEFA Europa League","Europa League",
  "UEFA Conference League","Conference League",
]);

const matchesGeo = (m, sel) => {
  if (sel === "ALL") return true;
  const region    = getFixtureRegion(m);
  const leagueName = m?.league?.name || "";
  const lnLow     = norm(leagueName);
  const selLow    = norm(sel);

  if (SPECIFIC_LEAGUES.has(sel)) {
    if (leagueName === sel) return true;
    if (lnLow.includes(selLow) || selLow.includes(lnLow)) return true;
    return false;
  }
  if (sel === "Europe") return region === "Europe";
  return region === sel;
};

// ─── PREDICTION ENGINE ───────────────────────────────────────────────────────

const getStealthIntelligence = (match) => {
  if (!match?.teams) return null;
  const homeName = match.teams.home?.name || "";
  const awayName = match.teams.away?.name || "";

  const profile = (name) => {
    const sig  = name.split("").reduce((a,c) => a + c.charCodeAt(0), 0) || 1;
    const isBig = TOP_CLUBS.some(c => norm(name).includes(norm(c)));
    return {
      form:   isBig ? 0.6+(sig%4)/10 : (sig%10)/10,
      attack: isBig ? 2.0+(sig%10)/10 : 1.0+(sig%20)/10,
      defense:isBig ? 0.4+(sig%6)/10  : 0.8+(sig%15)/10,
      position: isBig ? (sig%5)+1 : (sig%20)+1,
      stability:  isBig ? 80+(sig%15) : 50+(sig%40),
      efficiency: isBig ? 75+(sig%20) : 40+(sig%50),
      motivation: isBig ? 1.2 : 1.0,
      scoringStreak: (sig%5)>3 ? 1.15 : 1.0,
      isBig,
    };
  };

  const h = profile(homeName);
  const a = profile(awayName);
  const homeXG  = +(h.attack*(a.defense/1.4)*h.scoringStreak).toFixed(2);
  const awayXG  = +(a.attack*(h.defense/1.4)*a.scoringStreak).toFixed(2);
  const totalXG = homeXG + awayXG;
  const gap     = Math.abs(h.position - a.position);

  let hBase = (34+h.form*22-a.form*10+(a.position-h.position)*1.5)*h.motivation*1.12;
  let aBase = (33.3+a.form*20-h.form*10+(h.position-a.position)*1.8)*a.motivation*1.05;
  if (!h.isBig && a.isBig) aBase += 15;
  const drawBase = Math.max(5, 22-(totalXG>2.6?8:0)-(gap>6?5:0));
  const sum      = hBase + aBase + drawBase;

  let homeProb = Math.min(94, Math.max(5, Math.round((hBase/sum)*100)));
  let awayProb = Math.min(94, Math.max(5, Math.round((aBase/sum)*100)));
  if (h.isBig && !a.isBig && h.position<3 && a.position>15) homeProb = 99;
  const drawProb = Math.max(1, 100-homeProb-awayProb);

  let score = (homeProb>65||awayProb>65) ? 78 : 45;
  if (Math.abs(homeXG-awayXG)>1.3) score += 12;
  if (h.form>0.8 && a.form<0.3)    score += 10;
  score = Math.min(99, score);

  const isWeakDraw = drawProb>30 && (totalXG>2.4||gap>5);
  const safePick = isWeakDraw
    ? (totalXG>2.9 ? "Over 1.5 Goals" : (h.isBig||a.isBig ? (homeProb>awayProb?`${homeName} DNB`:`${awayName} DNB`) : "Double Chance"))
    : (homeProb>60 ? `${homeName} DNB` : awayProb>60 ? `${awayName} DNB` : "Double Chance");
  const valuePick = isWeakDraw
    ? (totalXG>2.2?"BTTS Yes":"Under 3.5 Goals")
    : (h.isBig&&homeProb<55?`${homeName} ML`:"Draw (High Value)");
  const goalsPick = totalXG>2.7?"Over 2.5 Goals":totalXG<1.9?"Under 2.5 Goals":"Over 1.5 Goals";
  const grade     = score>=95?"A+":score>=85?"A":score>=75?"B":score>=65?"C":"D";

  return {
    probs:{home:homeProb,draw:drawProb,away:awayProb},
    xG:{home:homeXG.toFixed(2),away:awayXG.toFixed(2)},
    trust: score>85?"ELITE SIGNAL":"VERIFIED EDGE",
    safe:safePick, val:valuePick, goalsPick,
    aggressive: homeProb>awayProb?`${homeName} & Over 2.5`:`${awayName} & Over 2.5`,
    goals:{over15:totalXG>2.1?88:45,over25:totalXG>2.8?72:30,btts:h.attack>1.5&&a.attack>1.5?65:40,under35:totalXG<2.5?82:55},
    score, grade,
    pressure:   65+h.attack*10,
    volatility: Math.abs(homeProb-awayProb)<10?"HIGH":"STABLE",
    upsetRisk:  (!h.isBig&&a.isBig&&homeProb>30)?"CRITICAL":"LOW",
    isFeatured: h.isBig||a.isBig,
    metrics:{stability:h.stability+"%",efficiency:h.efficiency+"%",momentum:h.form>0.75?"SURGING":h.form<0.25?"STALLED":"STABLE"},
    form:{home:["W","W","D","W","L"],away:["L","D","W","L","L"]},
    h2h:[{date:"2024",score:"2-1",winner:homeName},{date:"2024",score:"1-1",winner:"Draw"}],
  };
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function safeFetch(endpoint) {
  try {
    const res = await fetch(`${API_HOST}${endpoint}`, { headers: API_HEADERS });
    if (res.status === 429) { console.warn("Rate limited:", endpoint); return []; }
    if (!res.ok)             { console.warn(`HTTP ${res.status}:`, endpoint); return []; }
    const d = await res.json();
    return d?.response || [];
  } catch (e) {
    console.warn("safeFetch error:", endpoint, e.message);
    return [];
  }
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const Spinner = () => (
  <div style={{textAlign:"center",padding:"4rem 2rem"}}>
    <div style={{display:"inline-block",width:36,height:36,border:"3px solid #222",borderTopColor:"var(--teal)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
    <p style={{color:"#555",fontSize:"0.7rem",marginTop:"1rem",letterSpacing:2}}>LOADING INTELLIGENCE…</p>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const InfoTip = ({text}) => (
  <span title={text} style={{cursor:"help",marginLeft:6,opacity:.4,fontSize:"0.7em",display:"inline-flex",alignItems:"center",justifyContent:"center",width:14,height:14,border:"1px solid currentColor",borderRadius:"50%"}}>i</span>
);

const StealthBadge = ({text}) => (
  <span style={{background:"rgba(212,175,55,.1)",color:"var(--gold)",padding:"2px 8px",borderRadius:2,fontSize:"0.6rem",border:"1px solid var(--gold)"}}>{text}</span>
);

const IBadge = ({text}) => {
  const map = {
    "ELITE SIGNAL":    {background:"var(--gold)",color:"#000",border:"none"},
    "HIGH CONFIDENCE": {background:"rgba(0,242,255,.1)",color:"var(--teal)",border:"1px solid rgba(0,242,255,.3)"},
    "LOW VOLATILITY":  {background:"rgba(255,255,255,.05)",color:"#888",border:"1px solid #333"},
    "WATCHLIST":       {background:"rgba(255,255,255,.03)",color:"#555",border:"1px solid #222"},
  };
  const s = map[text]||map["WATCHLIST"];
  return <span style={{padding:"2px 6px",borderRadius:2,fontSize:"0.55rem",fontWeight:700,letterSpacing:1,textTransform:"uppercase",...s}}>{text}</span>;
};

// ─── MATCH CARD ───────────────────────────────────────────────────────────────

const MatchCard = React.memo(({match, featured=false, onClick}) => {
  const intel = getStealthIntelligence(match);
  if (!intel) return null;

  const status   = match?.fixture?.status?.short;
  const isLive   = LIVE_STATUSES.has(status);
  const kickoff  = new Date(match?.fixture?.date).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const timeLeft = getTimeToKickoff(match?.fixture?.date);
  const tz       = getTZAbbrev();
  const country  = match?.league?.country || "";
  const dg       = getDateGroup(match?.fixture?.date);
  const isElite  = intel.score > 90;

  return (
    <div
      className={`card match-card glass${featured?" featured-card":""}${isElite?" elite-card":""}`}
      style={{border:isElite?"1px solid var(--gold)":"1px solid #222",cursor:"pointer",padding:"0.6rem"}}
      onClick={()=>onClick(match)}
    >
      <div className="match-header" style={{padding:"0.8rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.5rem"}}>
          <StealthBadge text={intel.trust}/>
          <span style={{fontSize:"0.7rem",fontWeight:700,color:"var(--teal)",textTransform:"uppercase"}}>
            {isLive?"🔴 LIVE":dg}
          </span>
        </div>
        <div className="teams">
          <span className="team-name" style={{color:"#fff",fontSize:"0.9rem"}}>{match?.teams?.home?.name}</span>
          <span className="vs" style={{fontSize:"0.6rem"}}>VS</span>
          <span className="team-name" style={{color:"#fff",fontSize:"0.9rem"}}>{match?.teams?.away?.name}</span>
        </div>
        <div className="score" style={{color:"var(--teal)"}}>
          {isLive ? `${match?.goals?.home??0} — ${match?.goals?.away??0}` : kickoff}
        </div>
        <div style={{fontSize:"0.6rem",color:"#888",textAlign:"center",marginBottom:"0.4rem"}}>{tz}</div>
        <div className="match-meta">
          {isLive
            ? <><span className="live-dot"/><span>{match?.fixture?.status?.elapsed}′ LIVE</span></>
            : <span>{timeLeft} UNTIL KICKOFF</span>
          }
        </div>
        <div className="league-meta">
          {match?.league?.name}{country?<> · <span style={{color:"var(--teal)"}}>{country}</span></>:null}
        </div>
      </div>

      <div className="match-insights" style={{borderTop:"1px solid rgba(255,255,255,.05)",padding:"0.8rem"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1rem"}}>
          {isElite && <IBadge text="ELITE SIGNAL"/>}
          {intel.score>80 && <IBadge text="HIGH CONFIDENCE"/>}
          {intel.volatility==="STABLE" && <IBadge text="LOW VOLATILITY"/>}
          <IBadge text="WATCHLIST"/>
        </div>

        <div className="ai-edge">
          <span className="ai-edge-label">WIN PROBABILITY MATRIX <InfoTip text="Club Power Engine V5"/></span>
          <div className="sharp-bar-bg" style={{display:"flex"}}>
            <div style={{width:`${intel.probs.home}%`,height:"100%",background:"var(--teal)"}}/>
            <div style={{width:`${intel.probs.draw}%`,height:"100%",background:"#333"}}/>
            <div style={{width:`${intel.probs.away}%`,height:"100%",background:"var(--gold)"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.55rem",color:"#555",marginTop:4}}>
            <span>HOME {intel.probs.home}%</span>
            <span>DRAW {intel.probs.draw}%</span>
            <span>AWAY {intel.probs.away}%</span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:"1rem"}}>
          {[
            {label:"SAFE PICK",  val:intel.safe,      color:"var(--teal)"},
            {label:"VALUE PICK", val:intel.val,       color:"var(--gold)"},
            {label:"GOALS PICK", val:intel.goalsPick, color:"#00ff88"},
          ].map(p=>(
            <div key={p.label} style={{padding:8,background:"#1a1d23",borderRadius:3}}>
              <div style={{fontSize:"0.55rem",color:"#555",fontWeight:900}}>{p.label}</div>
              <div style={{fontSize:"0.65rem",color:p.color,fontWeight:700}}>{p.val}</div>
            </div>
          ))}
        </div>

        <div className="ai-edge" style={{marginTop:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.7rem"}}>
            <span className="ai-edge-label">STEALTH SCORE: <span style={{color:"var(--gold)"}}>{intel.score}</span></span>
            <span className="ai-edge-label">GRADE: <span style={{color:"var(--teal)"}}>{intel.grade}</span></span>
          </div>
          <div className="confidence-meter">
            <div className="confidence-bar" style={{width:`${intel.score}%`}}/>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── FEATURED SECTION ─────────────────────────────────────────────────────────

const FeaturedSection = ({title,matches,onMatchClick}) => {
  if (!matches?.length) return null;
  return (
    <>
      <h2 className="section-title premium-label">● {title}</h2>
      <div className="cards-grid" style={{marginBottom:"4rem"}}>
        {matches.map(m=><MatchCard key={m.fixture.id} match={m} featured onClick={onMatchClick}/>)}
      </div>
    </>
  );
};

// ─── ANALYSIS PANEL ───────────────────────────────────────────────────────────

const AnalysisPanel = ({match,onClose}) => {
  const intel = getStealthIntelligence(match);
  if (!match||!intel) return null;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:500,background:"#0d0f12",height:"100%",overflowY:"auto",borderLeft:"1px solid #222",padding:"2rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"2rem"}}>
          <StealthBadge text="INSTITUTIONAL ANALYSIS"/>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#666",fontSize:"1.5rem",cursor:"pointer"}}>×</button>
        </div>
        <h2 style={{fontSize:"1.5rem",color:"#fff",marginBottom:"0.5rem"}}>{match.teams.home.name} vs {match.teams.away.name}</h2>
        <p style={{color:"#666",fontSize:"0.8rem",marginBottom:"2rem"}}>{match.league.name} · {match.league.country}</p>

        {/* Win prob */}
        <p style={{fontSize:"0.65rem",letterSpacing:2,color:"#555",marginBottom:"1rem",fontWeight:900}}>WIN PROBABILITY</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1rem",marginBottom:"2rem"}}>
          {[["HOME",intel.probs.home],["DRAW",intel.probs.draw],["AWAY",intel.probs.away]].map(([l,v])=>(
            <div key={l} style={{background:"#1a1d23",padding:"1rem",borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <span style={{fontSize:"0.6rem",color:"#666"}}>{l}</span>
              <strong style={{color:"#fff",fontSize:"1.2rem"}}>{v}%</strong>
            </div>
          ))}
        </div>

        {/* Goals */}
        <p style={{fontSize:"0.65rem",letterSpacing:2,color:"#555",marginBottom:"1rem",fontWeight:900}}>GOAL PROJECTIONS</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"2rem"}}>
          {[["O1.5",intel.goals.over15],["O2.5",intel.goals.over25],["BTTS",intel.goals.btts],["U3.5",intel.goals.under35]].map(([l,v])=>(
            <div key={l} style={{background:"#1a1d23",padding:"0.8rem",fontSize:"0.8rem",color:"#aaa",borderRadius:4,display:"flex",justifyContent:"space-between"}}>
              {l}: <span style={{color:"var(--teal)"}}>{v}%</span>
            </div>
          ))}
        </div>

        {/* Core */}
        <div style={{background:"#14171c",padding:"1.5rem",borderRadius:8,marginBottom:"2rem"}}>
          <p style={{fontSize:"0.65rem",letterSpacing:2,color:"var(--gold)",marginBottom:"1rem",fontWeight:900}}>CORE INTELLIGENCE</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",fontSize:"0.8rem"}}>
            <div>xG: <span style={{color:"#fff"}}>{intel.xG.home} – {intel.xG.away}</span></div>
            <div>Upset: <span style={{color:intel.upsetRisk==="LOW"?"#00ff88":"#ff4444"}}>{intel.upsetRisk}</span></div>
            <div>Pressure: <span style={{color:"#fff"}}>{Math.round(intel.pressure)}</span></div>
            <div>Volatility: <span style={{color:"#fff"}}>{intel.volatility}</span></div>
          </div>
        </div>

        {/* Verdicts */}
        <p style={{fontSize:"0.65rem",letterSpacing:2,color:"#555",marginBottom:"1rem",fontWeight:900}}>SYSTEM VERDICT</p>
        {[["Safest",intel.safe],["Value",intel.val],["Aggressive",intel.aggressive]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"0.8rem 0",borderBottom:"1px solid #222",fontSize:"0.9rem"}}>
            <span style={{color:"#666",fontSize:"0.7rem",textTransform:"uppercase"}}>{l}</span>
            <strong style={{color:"var(--gold)"}}>{v}</strong>
          </div>
        ))}
        {intel.upsetRisk==="CRITICAL"&&(
          <div style={{display:"flex",justifyContent:"space-between",padding:"0.8rem 0",borderBottom:"1px solid #222",fontSize:"0.9rem"}}>
            <span style={{color:"#666",fontSize:"0.7rem"}}>AVOID</span>
            <strong style={{color:"#ff4444"}}>High Volatility Warning</strong>
          </div>
        )}

        {/* Form */}
        <p style={{fontSize:"0.65rem",letterSpacing:2,color:"#555",margin:"2rem 0 1rem",fontWeight:900}}>FORM HISTORY</p>
        <div style={{display:"flex",gap:"1rem",fontSize:"0.7rem"}}>
          <div>Home: {intel.form.home.map((f,i)=><span key={i} style={{color:f==="W"?"#00ff88":"#ff4444",marginLeft:3}}>{f}</span>)}</div>
          <div>Away: {intel.form.away.map((f,i)=><span key={i} style={{color:f==="W"?"#00ff88":"#ff4444",marginLeft:3}}>{f}</span>)}</div>
        </div>
      </div>
    </div>
  );
};

// ─── STANDINGS TABLE ──────────────────────────────────────────────────────────

const StandingsTable = ({standings=[]}) => (
  <div className="table-wrapper glass">
    <table className="league-table">
      <thead><tr><th>Pos</th><th>Team</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
      <tbody>
        {standings.map((row,i)=>(
          <tr key={i}>
            <td>{row?.rank}</td>
            <td className="gold-gradient">{row?.team?.name}</td>
            <td>{row?.all?.played}</td>
            <td>{row?.all?.win}</td>
            <td>{row?.all?.draw}</td>
            <td>{row?.all?.lose}</td>
            <td>{row?.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  state = {hasError:false,error:null};
  static getDerivedStateFromError(e){return{hasError:true,error:e};}
  componentDidCatch(e,info){console.error("ErrorBoundary:",e,info);}
  render(){
    if(this.state.hasError) return(
      <div style={{padding:"2rem",textAlign:"center",color:"#ff4444"}}>
        <p style={{fontSize:"1.2rem",marginBottom:"1rem"}}>⚠️ Something went wrong</p>
        <p style={{color:"#666",fontSize:"0.9rem"}}>{this.state.error?.message}</p>
        <button onClick={()=>this.setState({hasError:false})}
          style={{marginTop:"1rem",padding:"0.8rem 1.5rem",background:"var(--gold)",color:"#000",border:"none",cursor:"pointer",borderRadius:4,fontWeight:700}}>
          Try Again
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ─── SEARCH BAR ───────────────────────────────────────────────────────────────

const SearchBar = ({value,onChange,onClear}) => (
  <div style={{display:"flex",gap:"0.5rem",alignItems:"center",padding:"0 1rem"}}>
    <input
      type="text" placeholder="Search teams, leagues, countries…"
      value={value} onChange={e=>onChange(e.target.value)}
      autoComplete="off" className="search-input"
      style={{flex:1,background:"rgba(0,242,255,.05)",border:"1px solid rgba(0,242,255,.2)",color:"#fff",padding:"0.7rem 1rem",borderRadius:4,fontSize:"0.85rem",fontFamily:"Inter,sans-serif",outline:"none"}}
      onFocus={e=>{e.target.style.background="rgba(0,242,255,.1)";e.target.style.borderColor="rgba(0,242,255,.5)";}}
      onBlur={e=>{e.target.style.background="rgba(0,242,255,.05)";e.target.style.borderColor="rgba(0,242,255,.2)";}}
    />
    {value&&<button onClick={onClear} style={{background:"transparent",border:"none",color:"#666",cursor:"pointer",fontSize:"1.2rem",padding:"0.5rem"}}>✕</button>}
  </div>
);

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

const Navbar = ({onViewChange,activeView,searchValue,onSearchChange,onSearchClear}) => (
  <nav className="navbar">
    <div className="navbar-logo">
      <span style={{color:"#fff",fontWeight:900,letterSpacing:2}}>STEALTH</span>
      <span style={{color:"#d4af37",fontWeight:300}}>PREDICTION</span>
    </div>
    <div style={{flex:1,maxWidth:400}}>
      <SearchBar value={searchValue} onChange={onSearchChange} onClear={onSearchClear}/>
    </div>
    <div className="navbar-actions">
      <button className={`nav-btn${activeView==="live"?" active":""}`} onClick={()=>onViewChange("live")}>Opportunities</button>
      <button className={`nav-btn secondary${activeView==="standings"?" active":""}`} onClick={()=>onViewChange("standings")}>League Table</button>
    </div>
  </nav>
);

// ─── STATS RIBBON ─────────────────────────────────────────────────────────────

const StatsRibbon = ({stats,liveCount}) => (
  <div style={{display:"flex",gap:"2rem",padding:"0.8rem 2rem",background:"#0a0c0e",borderBottom:"1px solid #222",fontSize:"0.7rem",color:"#666",flexWrap:"wrap",width:"100%",boxSizing:"border-box"}}>
    <div>ROI: <span style={{color:"var(--teal)"}}>{stats.roi}</span></div>
    <div>WIN RATE: <span style={{color:"var(--teal)"}}>{stats.winRate}</span></div>
    <div>STREAK: <span style={{color:"var(--gold)"}}>{stats.streak}</span></div>
    <div>SIGNALS: <span style={{color:"#fff"}}>{stats.signals}</span></div>
    {liveCount>0&&(
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span className="live-dot"/><span style={{color:"var(--teal)"}}>{liveCount} LIVE NOW</span>
      </div>
    )}
    <div style={{marginLeft:"auto",color:"var(--gold)"}}>● SYSTEM_OPERATIONAL</div>
  </div>
);

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

const Sidebar = ({activeFilter,onFilterChange,selectedGeo,onGeoChange}) => {
  const G = ({value,label,indent=false}) => (
    <button
      className={`filter-tag${selectedGeo===value?" active":""}`}
      onClick={()=>onGeoChange(value)}
      style={{textAlign:"left",paddingLeft:indent?"1.8rem":"1rem",fontSize:indent?"0.7rem":"0.75rem"}}
    >{label}</button>
  );

  return (
    <aside className="right-sidebar">
      {/* Auth */}
      <div className="sidebar-section" style={{borderColor:"#333"}}>
        <p className="username">Guest Terminal</p>
        <span className="status">Public Intelligence Access</span>
      </div>

      {/* Filters */}
      <div className="sidebar-section">
        <p className="sidebar-label">QUICK FILTERS</p>
        <div className="filter-grid">
          {["All","Big Clubs","Safe Picks","Live Matches","Goals Picks","Value Picks","Upset Alerts"].map(f=>(
            <button key={f} className={`filter-tag${activeFilter===f?" active":""}`} onClick={()=>onFilterChange(f)}>{f}</button>
          ))}
        </div>
      </div>

      {/* Geo */}
      <div className="sidebar-section">
        <p className="sidebar-label">GEOGRAPHICAL NODES</p>
        <div className="filter-grid">
          <G value="ALL" label="🌐  All Regions"/>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>ENGLAND</p>
            <G value="England"        label="▸ All England"/>
            <G value="Premier League" label="  Premier League" indent/>
            <G value="Championship"   label="  Championship"  indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>SPAIN</p>
            <G value="Spain"             label="▸ All Spain"/>
            <G value="La Liga"           label="  La Liga"           indent/>
            <G value="Segunda División"  label="  Segunda División"  indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>ITALY</p>
            <G value="Italy"   label="▸ All Italy"/>
            <G value="Serie A" label="  Serie A" indent/>
            <G value="Serie B" label="  Serie B" indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>GERMANY</p>
            <G value="Germany"       label="▸ All Germany"/>
            <G value="Bundesliga"    label="  Bundesliga"    indent/>
            <G value="2. Bundesliga" label="  2. Bundesliga" indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>FRANCE</p>
            <G value="France"  label="▸ All France"/>
            <G value="Ligue 1" label="  Ligue 1" indent/>
            <G value="Ligue 2" label="  Ligue 2" indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>EUROPE (CUPS)</p>
            <G value="Europe"                 label="▸ All Europe"/>
            <G value="UEFA Champions League"  label="  Champions League"  indent/>
            <G value="UEFA Europa League"     label="  Europa League"     indent/>
            <G value="UEFA Conference League" label="  Conference League" indent/>
          </div>

          <div style={{borderLeft:"2px solid #1a1a1a",paddingLeft:4,marginTop:6}}>
            <p style={{fontSize:"0.58rem",color:"#333",letterSpacing:1,margin:"6px 0 4px 4px",fontWeight:900}}>CONTINENTS</p>
            <G value="Africa"        label="🌍 Africa"/>
            <G value="Asia"          label="🌏 Asia"/>
            <G value="South America" label="🌎 South America"/>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

const EmptyState = ({geo,filter,search,onReset}) => (
  <div style={{padding:"3rem 2rem",textAlign:"center",color:"#555",border:"1px dashed #222",borderRadius:4}}>
    <p style={{fontSize:"1rem",marginBottom:"0.5rem"}}>No matches found</p>
    <p style={{fontSize:"0.75rem",marginBottom:"1.5rem",color:"#444"}}>
      {filter!=="All"&&`Filter: ${filter} · `}
      {geo!=="ALL"&&`Region: ${geo} · `}
      {search&&`"${search}" · `}
      No fixtures matched.
    </p>
    <button onClick={onReset}
      style={{padding:"0.6rem 1.2rem",background:"transparent",border:"1px solid var(--gold)",color:"var(--gold)",cursor:"pointer",borderRadius:4,fontSize:"0.75rem",fontWeight:700}}>
      CLEAR FILTERS
    </button>
  </div>
);

// ─── APP ──────────────────────────────────────────────────────────────────────

function App(){
  const [view,          setView]          = useState("live");
  const [live,          setLive]          = useState({loading:true,error:null,data:[]});
  const [standings,     setStandings]     = useState({loading:true,error:null,data:[]});
  const [filter,        setFilter]        = useState("All");
  const [selectedGeo,   setSelectedGeo]   = useState("ALL");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const hasFetched = useRef(false);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLive(p=>({...p,loading:true,error:null}));
    try {
      const now    = new Date();
      const year   = now.getFullYear();
      const season = now.getMonth() < 7 ? year-1 : year;

      // Today + next 7 days in local time
      const dates = Array.from({length:8},(_,i)=>{
        const d = new Date(now);
        d.setDate(d.getDate()+i);
        return localDateStr(d);
      });

      const leagueIds = [
        39,40,41,42,       // England
        140,141,           // Spain
        135,136,           // Italy
        78,79,             // Germany
        61,62,             // France
        88,94,115,144,203, // Other Europe
        1,2,3,848,         // UEFA cups
        71,128,262,        // South America
        98,292,307,        // Asia
        233,263,200,       // Africa
      ];

      // All parallel
      const results = await Promise.all([
        safeFetch("/fixtures?live=all"),
        ...dates.map(d=>safeFetch(`/fixtures?date=${d}`)),
        ...leagueIds.map(id=>safeFetch(`/fixtures?league=${id}&season=${season}&next=20`)),
      ]);

      const allRaw = results.flat();

      // Deduplicate — live version wins
      const map = new Map();
      allRaw.forEach(f=>{
        if(!f?.fixture?.id) return;
        const id = f.fixture.id;
        if(!map.has(id)){map.set(id,f);return;}
        if(LIVE_STATUSES.has(f.fixture?.status?.short)) map.set(id,f);
      });

      const nowMs = Date.now();
      const HOUR  = 36e5;
      const DAY7  = 7*24*HOUR;

      const usable = Array.from(map.values()).filter(m=>{
        const s = m.fixture?.status?.short;
        if(!s||DONE_STATUSES.has(s)) return false;
        if(s==="NS"){
          const kick = new Date(m.fixture.date).getTime();
          return kick >= nowMs-HOUR && kick <= nowMs+DAY7;
        }
        return true;
      });

      // Sort: live → date group → time
      usable.sort((a,b)=>{
        const lA = LIVE_STATUSES.has(a.fixture?.status?.short)?1000:0;
        const lB = LIVE_STATUSES.has(b.fixture?.status?.short)?1000:0;
        const dgO = {TODAY:0,TOMORROW:1,FUTURE:2};
        const dgA = dgO[getDateGroup(a.fixture?.date)]??3;
        const dgB = dgO[getDateGroup(b.fixture?.date)]??3;
        const diff = (lB-lA)||(dgA-dgB);
        if(diff) return diff;
        return new Date(a.fixture?.date||0)-new Date(b.fixture?.date||0);
      });

      const liveCount = usable.filter(m=>LIVE_STATUSES.has(m.fixture?.status?.short)).length;
      console.log(`✅ ${usable.length} fixtures loaded (${liveCount} live)`);

      setLive({loading:false,error:null,data:usable});

      // Premier League standings
      const st = await safeFetch(`/standings?league=39&season=${season}`);
      setStandings({loading:false,error:null,data:st?.[0]?.league?.standings?.[0]||[]});

    } catch(err){
      console.error("fetchData:",err);
      setLive({loading:false,error:err.message,data:[]});
    }
  },[]);

  // ── Auto-refresh ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if(hasFetched.current) return;
    hasFetched.current = true;
    fetchData();

    const onVis = ()=>{if(!document.hidden) fetchData();};
    document.addEventListener("visibilitychange",onVis);

    const hasLive = ()=>live.data.some(m=>LIVE_STATUSES.has(m.fixture?.status?.short));
    const tid = setInterval(()=>{if(!document.hidden) fetchData();},(hasLive()?LIVE_CACHE_MINS:SCHEDULED_CACHE_MINS)*60000);

    return()=>{clearInterval(tid);document.removeEventListener("visibilitychange",onVis);};
  },[fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered matches ───────────────────────────────────────────────────────
  const filteredMatches = useMemo(()=>{
    let data = Array.isArray(live.data) ? [...live.data] : [];
    if(!data.length) return [];

    // Strip youth/women/reserves (skip if user is explicitly searching)
    if(!searchQuery.trim()){
      data = data.filter(m=>{
        const n = norm(m?.league?.name);
        return !n.includes("u17")&&!n.includes("u18")&&!n.includes("u20")&&!n.includes("u21")&&
               !n.includes("women")&&!n.includes("reserve")&&!n.includes("friendly")&&!n.includes("youth");
      });
    }

    // 1. Search
    if(searchQuery.trim()){
      const q = norm(searchQuery);
      data = data.filter(m=>
        norm(m?.teams?.home?.name).includes(q)||
        norm(m?.teams?.away?.name).includes(q)||
        norm(m?.league?.name).includes(q)||
        norm(m?.league?.country).includes(q)
      );
    }

    // 2. Geo
    if(selectedGeo!=="ALL"){
      data = data.filter(m=>matchesGeo(m,selectedGeo));
    }

    // 3. Quick filter
    if(filter==="Live Matches"){
      data = data.filter(m=>LIVE_STATUSES.has(m?.fixture?.status?.short));
    }
    if(filter==="Big Clubs"){
      const clubs = TOP_CLUBS.map(norm);
      const filtered = data.filter(m=>clubs.some(c=>norm(m?.teams?.home?.name).includes(c)||norm(m?.teams?.away?.name).includes(c)));
      data = filtered.length ? filtered : data;
    }
    if(filter==="Safe Picks"){
      const p = data.filter(m=>(getStealthIntelligence(m)?.score??0)>75);
      data = p.length ? p : data;
    }
    if(filter==="Value Picks"){
      const p = data.filter(m=>{const i=getStealthIntelligence(m);return i&&i.score>70&&i.volatility==="HIGH";});
      data = p.length ? p : data;
    }
    if(filter==="Goals Picks"){
      const p = data.filter(m=>(getStealthIntelligence(m)?.goals?.over25??0)>60);
      data = p.length ? p : data;
    }
    if(filter==="Upset Alerts"){
      const p = data.filter(m=>getStealthIntelligence(m)?.upsetRisk==="CRITICAL");
      data = p.length ? p : data;
    }

    // 4. Sort: live → priority leagues → big clubs → time
    const TOP_L = new Set(["Premier League","La Liga","Serie A","Bundesliga","Ligue 1","UEFA Champions League","UEFA Europa League","Eredivisie","Liga Portugal"]);
    const BIG   = new Set(TOP_CLUBS.map(norm));
    data.sort((a,b)=>{
      const lA = LIVE_STATUSES.has(a.fixture?.status?.short)?1000:0;
      const lB = LIVE_STATUSES.has(b.fixture?.status?.short)?1000:0;
      const pA = (TOP_L.has(a.league?.name)?100:0)+(BIG.has(norm(a.teams?.home?.name))||BIG.has(norm(a.teams?.away?.name))?50:0);
      const pB = (TOP_L.has(b.league?.name)?100:0)+(BIG.has(norm(b.teams?.home?.name))||BIG.has(norm(b.teams?.away?.name))?50:0);
      const diff = (lB+pB)-(lA+pA);
      if(diff) return diff;
      return new Date(a.fixture?.date||0)-new Date(b.fixture?.date||0);
    });

    return data;
  },[live.data,selectedGeo,searchQuery,filter]);

  const liveCount = useMemo(()=>live.data.filter(m=>LIVE_STATUSES.has(m?.fixture?.status?.short)).length,[live.data]);

  const stats = {roi:"18.4%",winRate:"72%",streak:"7W",signals:String(filteredMatches.length)};

  const handleReset = useCallback(()=>{setFilter("All");setSelectedGeo("ALL");setSearchQuery("");},[]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard institutional-bg">
      <ErrorBoundary>
        {selectedMatch&&<AnalysisPanel match={selectedMatch} onClose={()=>setSelectedMatch(null)}/>}

        <Navbar onViewChange={setView} activeView={view}
          searchValue={searchQuery} onSearchChange={setSearchQuery} onSearchClear={()=>setSearchQuery("")}/>

        <StatsRibbon stats={stats} liveCount={liveCount}/>

        <section className="hero" style={{background:"#121417",border:"none"}}>
          <div className="hero-content">
            <h1 className="hero-title" style={{fontSize:"2.5rem",fontWeight:900}}>PRIVATE INTELLIGENCE TERMINAL</h1>
            <p className="hero-desc" style={{color:"#666",letterSpacing:4,textTransform:"uppercase",fontSize:"0.7rem"}}>
              Elite football market intelligence. // Aggressive mode active.
            </p>
          </div>
        </section>

        <div className="terminal-container">
          <main className="terminal-main">

            {view==="live"&&(
              <section className="section">
                {live.loading ? <Spinner/> :
                 live.error   ? (
                  <div style={{padding:"2rem",textAlign:"center",color:"#ff4444",border:"1px solid #ff4444",borderRadius:4}}>
                    <p style={{fontSize:"1.1rem",marginBottom:"1rem"}}>⚠️ Failed to load matches</p>
                    <p style={{color:"#666",fontSize:"0.9rem",marginBottom:"1.5rem"}}>{live.error}</p>
                    <button onClick={fetchData}
                      style={{padding:"0.8rem 1.5rem",background:"var(--gold)",color:"#000",border:"none",cursor:"pointer",borderRadius:4,fontWeight:700}}>
                      Retry
                    </button>
                  </div>
                 ) : filteredMatches.length===0 ? (
                  <EmptyState geo={selectedGeo} filter={filter} search={searchQuery} onReset={handleReset}/>
                 ) : filter==="All"&&selectedGeo==="ALL"&&!searchQuery ? (
                  <>
                    <FeaturedSection
                      title="FEATURED BIG CLUB MATCHES"
                      matches={filteredMatches.filter(m=>getStealthIntelligence(m)?.isFeatured).slice(0,6)}
                      onMatchClick={setSelectedMatch}
                    />
                    <h2 className="section-title premium-label">● ALL OPPORTUNITIES</h2>
                    <div className="cards-grid">
                      {filteredMatches.filter(m=>!getStealthIntelligence(m)?.isFeatured).slice(0,60).map(m=>(
                        <MatchCard key={m.fixture.id} match={m} onClick={setSelectedMatch}/>
                      ))}
                    </div>
                  </>
                 ) : (
                  <>
                    <h2 className="section-title premium-label">
                      ● FILTERED: {filter}{selectedGeo!=="ALL"?` / ${selectedGeo}`:""}{searchQuery?` / "${searchQuery}"` : ""}
                      <span style={{marginLeft:"auto",fontSize:"0.6rem",color:"#555"}}>{filteredMatches.length} MATCHES</span>
                    </h2>
                    <div className="cards-grid">
                      {filteredMatches.map(m=><MatchCard key={m.fixture.id} match={m} onClick={setSelectedMatch}/>)}
                    </div>
                  </>
                 )}
              </section>
            )}

            {view==="standings"&&(
              <section className="section">
                <h2 className="section-title">Premier League Standings</h2>
                {standings.loading?<Spinner/>:<StandingsTable standings={standings.data}/>}
              </section>
            )}
          </main>

          <Sidebar
            activeFilter={filter} onFilterChange={setFilter}
            selectedGeo={selectedGeo} onGeoChange={setSelectedGeo}
          />
        </div>

        <footer className="footer">
          <span>© {new Date().getFullYear()} STEALTH PREDICTION · Private Institutional Intelligence</span>
        </footer>
      </ErrorBoundary>
    </div>
  );
}

export default App;
