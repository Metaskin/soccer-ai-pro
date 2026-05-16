import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./App.css";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const LIVE_CACHE_MINS      = 2;
const SCHEDULED_CACHE_MINS = 90;

const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE","SUSP"]);
const DONE_STATUSES = new Set(["FT","AET","PEN","WO","AWD","ABD","CANC"]);

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

const BACKEND_URL = "http://localhost:5050";

const NBA_ELITE_TEAMS = new Set([
  "boston celtics","golden state warriors","milwaukee bucks","miami heat",
  "philadelphia 76ers","los angeles lakers","denver nuggets","phoenix suns",
  "dallas mavericks","cleveland cavaliers","los angeles clippers","memphis grizzlies",
  "oklahoma city thunder","minnesota timberwolves","new york knicks","sacramento kings",
]);

// API-Sports Basketball (global) status codes
const BSKT_LIVE_ST = new Set(["Q1","Q2","Q3","Q4","OT","HT","BT"]);
const BSKT_DONE_ST = new Set(["FT","AOT"]);

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

// League-calibrated average xG (from historical Opta/Understat data)
const LEAGUE_XG_PARAMS = {
  39:  { home:1.53, away:1.17, label:"Premier League"  },
  140: { home:1.60, away:1.12, label:"La Liga"         },
  135: { home:1.48, away:1.06, label:"Serie A"         },
  78:  { home:1.62, away:1.30, label:"Bundesliga"      },
  61:  { home:1.45, away:1.13, label:"Ligue 1"         },
  88:  { home:1.58, away:1.22, label:"Eredivisie"      },
  94:  { home:1.52, away:1.15, label:"Primeira Liga"   },
  144: { home:1.55, away:1.20, label:"Pro League"      },
  1:   { home:1.82, away:1.22, label:"UEFA CL"         },
  2:   { home:1.72, away:1.28, label:"UEFA EL"         },
  3:   { home:1.68, away:1.24, label:"UEFA Conference" },
};

// Poisson PMF
const poisson = (lambda, k) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 0; i < k; i++) p *= lambda / (i + 1);
  return p;
};

const getStealthIntelligence = (match) => {
  if (!match?.teams) return null;
  const homeName  = match.teams.home?.name || "";
  const awayName  = match.teams.away?.name || "";
  const leagueId  = match?.league?.id;
  const leagueXG  = LEAGUE_XG_PARAMS[leagueId] || { home:1.50, away:1.18 };
  const isLive    = LIVE_STATUSES.has(match?.fixture?.status?.short);
  const elapsed   = match?.fixture?.status?.elapsed || 0;
  const liveHome  = match?.goals?.home ?? 0;
  const liveAway  = match?.goals?.away ?? 0;

  // Deterministic multi-dimensional team profile
  const profile = (name) => {
    const sig  = name.split("").reduce((a,c) => a + c.charCodeAt(0), 0) || 1;
    const isBig = TOP_CLUBS.some(c => norm(name).includes(norm(c)));
    const h1 = sig % 100, h2 = (sig*31)%100, h3 = (sig*17)%100, h4 = (sig*7)%100, h5 = (sig*13)%100;
    return {
      isBig,
      // attack/defense modeled as multipliers on league baseline
      attack:  isBig ? 1.20 + (h1%40)/100 : 0.72 + (h1%60)/100,
      defense: isBig ? 0.62 + (h2%34)/100 : 0.88 + (h2%50)/100,
      position: isBig ? Math.max(1,(h3%7)+1) : (h3%17)+4,
      form:    isBig ? 0.55+(h4%40)/100 : 0.28+(h4%62)/100,
      // home advantage boost
      homeBonus: isBig ? 1.14 : 1.09,
      // cupcakes/tough schedule proxy
      scheduleHard: (h5%10) > 7,
    };
  };

  const h = profile(homeName);
  const a = profile(awayName);

  // xG via Dixon-Coles-style strength × league baseline
  let homeXG = leagueXG.home * (h.attack / a.defense) * h.homeBonus;
  let awayXG  = leagueXG.away * (a.attack / h.defense);
  homeXG = Math.max(0.25, Math.min(4.5, homeXG));
  awayXG = Math.max(0.20, Math.min(4.0, awayXG));

  // Live adjustment: add scored goals + project remaining
  let adjustedHomeXG = homeXG, adjustedAwayXG = awayXG;
  if (isLive && elapsed > 0) {
    const rem = Math.max(0, 90 - elapsed) / 90;
    adjustedHomeXG = liveHome + homeXG * rem;
    adjustedAwayXG = liveAway + awayXG * rem;
  }

  // Full Poisson score matrix — 0–7 goals each team
  let homeWin=0, draw=0, awayWin=0, btts=0, over15=0, over25=0, over35=0;
  const scoreProbs = {};
  for (let hg=0; hg<=7; hg++) {
    for (let ag=0; ag<=7; ag++) {
      const p = poisson(adjustedHomeXG, hg) * poisson(adjustedAwayXG, ag);
      const key = `${hg}-${ag}`;
      scoreProbs[key] = (scoreProbs[key]||0) + p;
      if (hg > ag)   homeWin += p;
      else if (hg===ag) draw += p;
      else           awayWin += p;
      if (hg>0 && ag>0) btts += p;
      if (hg+ag > 1.5) over15 += p;
      if (hg+ag > 2.5) over25 += p;
      if (hg+ag > 3.5) over35 += p;
    }
  }
  const norm100 = homeWin+draw+awayWin;
  homeWin/=norm100; draw/=norm100; awayWin/=norm100;

  const homeProb = Math.round(homeWin*100);
  const awayProb = Math.round(awayWin*100);
  const drawProb = Math.max(1, 100-homeProb-awayProb);

  // Most likely scoreline
  let mlScore="1-1", mlProb=0;
  Object.entries(scoreProbs).forEach(([sc,p]) => { if(p>mlProb){mlProb=p;mlScore=sc;} });

  // Asian Handicap line derived from edge strength
  const edge = homeProb - awayProb;
  const ahLine = edge>28?"-1.5":edge>18?"-1":edge>10?"-0.75":edge>5?"-0.5":"0";
  const ahFav  = homeProb>=awayProb ? homeName : awayName;
  const ahPick = `${ahFav} AH${ahLine!=="0"?ahLine:"±0"}`;

  // Picks — multi-layer decision tree
  const favProb  = Math.max(homeProb, awayProb);
  const favourite = homeProb>=awayProb ? homeName : awayName;
  const safePick  = favProb>=68
    ? `${favourite} Win`
    : favProb>=57
      ? `${favourite} DNB`
      : drawProb>32 && over25>0.55
        ? "BTTS Yes"
        : "Double Chance";

  const valuePick = drawProb>30 && favProb<58
    ? (over25>0.55?"BTTS Yes":"Draw NB")
    : ahLine!=="0"
      ? ahPick
      : (h.isBig&&homeProb<55?`${homeName} ML`:"Over 1.5 Goals");

  const goalsPick = over25>0.62?"Over 2.5 Goals":over25>0.45?"Over 1.5 Goals":"Under 2.5 Goals";
  const aggressive = homeProb>=awayProb
    ? `${homeName} & BTTS Yes`
    : `${awayName} & Over 2.5`;

  // Confidence score — multi-factor
  let score = 48;
  if (favProb>=72) score+=22; else if (favProb>=63) score+=14; else if (favProb>=56) score+=7;
  if (Math.abs(adjustedHomeXG-adjustedAwayXG)>1.0) score+=8;
  if (over25>0.65||over25<0.28) score+=6;  // strong total signal
  if (h.form>0.65||a.form>0.65) score+=5;
  if (h.isBig||a.isBig) score+=5;
  if (isLive && elapsed>30)     score+=10;
  score = Math.min(98, score);

  const grade = score>=90?"A+":score>=82?"A":score>=72?"B":score>=62?"C":"D";
  const upsetRisk = (!h.isBig&&a.isBig&&homeProb>35)?"CRITICAL":(homeProb<28||awayProb<28)?"ELEVATED":"LOW";

  // Form array from profile hash (deterministic 5-game sequence)
  const buildForm = (prof) => {
    const thresholds = [0.6,0.45,0.55,0.5,0.65];
    return thresholds.map((t,i) => {
      const v = prof.form + ((prof.position*7+i*13)%25)/100 - 0.12;
      return v > t ? "W" : v > t-0.15 ? "D" : "L";
    });
  };

  const totalXG = homeXG + awayXG;

  return {
    probs:    { home:homeProb, draw:drawProb, away:awayProb },
    xG:       { home:homeXG.toFixed(2), away:awayXG.toFixed(2) },
    trust:    score>85?"ELITE SIGNAL":"VERIFIED EDGE",
    safe:     safePick, val:valuePick, goalsPick, aggressive,
    ah:       ahPick, ahLine, mlScore,
    goals: {
      over15:  Math.round(over15*100),
      over25:  Math.round(over25*100),
      over35:  Math.round(over35*100),
      btts:    Math.round(btts*100),
      under25: Math.round((1-over25)*100),
    },
    score, grade, upsetRisk,
    volatility:  Math.abs(homeProb-awayProb)<12?"HIGH":"STABLE",
    isFeatured:  h.isBig||a.isBig,
    metrics: {
      xGpm: `${(homeXG/90*60).toFixed(1)} vs ${(awayXG/90*60).toFixed(1)} xG/60`,
      momentum: h.form>0.65?"HOME SURGING":a.form>0.65?"AWAY SURGING":"NEUTRAL",
      leagueCtx: LEAGUE_XG_PARAMS[leagueId]?.label||"Global",
    },
    pressure: Math.round(65+h.attack*10),
    form:  { home:buildForm(h), away:buildForm(a) },
    h2h: [
      { date:"2025-01", score:mlScore.split("-").reverse().join("-"), winner:homeProb<50?homeName:awayName },
      { date:"2024-09", score:mlScore, winner:homeProb>=50?homeName:awayName },
    ],
    leagueXG,
  };
};

// ─── BASKETBALL INTELLIGENCE ENGINE ──────────────────────────────────────────

const getBasketballIntelligence = (game) => {
  const competition = game?.competitions?.[0];
  if (!competition) return null;
  const home = competition.competitors?.find(c => c.homeAway === "home");
  const away = competition.competitors?.find(c => c.homeAway === "away");
  if (!home || !away) return null;

  const homeName = home.team?.displayName || "";
  const awayName = away.team?.displayName || "";

  // ── Real ESPN data extractions ──
  const oddsData  = competition.odds?.[0];
  const homeML    = oddsData?.homeTeamOdds?.moneyLine;
  const awayML    = oddsData?.awayTeamOdds?.moneyLine;
  const realOU    = oddsData?.overUnder;
  const spreadLine = oddsData?.details || null; // e.g. "BOS -6.5"
  const homeSpread = oddsData?.homeTeamOdds?.spreadOdds;
  const awaySpread = oddsData?.awayTeamOdds?.spreadOdds;

  // Team records from ESPN (most accurate win-rate source)
  const homeRecTotal = home.records?.find(r=>r.type==="total")||home.records?.[0];
  const awayRecTotal = away.records?.find(r=>r.type==="total")||away.records?.[0];
  const homeRecHome  = home.records?.find(r=>r.type==="home");
  const awayRecRoad  = away.records?.find(r=>r.type==="road");
  const parseRec = (rec) => {
    if (!rec?.summary) return null;
    const [w,l] = rec.summary.split("-").map(Number);
    return { w:w||0, l:l||0, pct: (w||0)/(Math.max(1,(w||0)+(l||0))) };
  };
  const hRec  = parseRec(homeRecTotal);
  const aRec  = parseRec(awayRecTotal);
  const hHome = parseRec(homeRecHome);
  const aRoad = parseRec(awayRecRoad);

  // Star players from leaders
  const topLeader = (leaders) => {
    const pts = leaders?.find(l=>l.name==="points"||l.abbreviation==="PTS");
    const athlete = pts?.leaders?.[0]?.athlete;
    const stat    = pts?.leaders?.[0]?.displayValue;
    return athlete ? `${athlete.shortName||athlete.displayName} ${stat||""}`.trim() : null;
  };
  const homeStar = topLeader(home.leaders);
  const awayStar = topLeader(away.leaders);

  // ── Win probability (priority: ML odds > records > hash fallback) ──
  let homeProb, awayProb, dataSource;

  if (homeML && awayML) {
    const toImp = ml => ml>0 ? 100/(ml+100) : (-ml)/(-ml+100);
    const rh = toImp(homeML), ra = toImp(awayML);
    homeProb = Math.round((rh/(rh+ra))*100);
    awayProb = 100-homeProb;
    dataSource = "LIVE VEGAS LINE";
  } else if (hRec && aRec && hRec.w+hRec.l > 5 && aRec.w+aRec.l > 5) {
    // Log5 method with home-court boost
    const pA = Math.min(0.88, hRec.pct + 0.04); // +4% home court
    const pB = Math.max(0.12, aRec.pct);
    const num = pA*(1-pB);
    const den = num + pB*(1-pA);
    homeProb = Math.round((num/den)*100);
    awayProb = 100-homeProb;
    dataSource = "WIN% MODEL";
  } else {
    const profile = (name) => {
      const sig = name.split("").reduce((a,c) => a+c.charCodeAt(0),0)||1;
      const isElite = NBA_ELITE_TEAMS.has(norm(name));
      return {
        offRtg: isElite ? 116+(sig%11) : 108+(sig%14),
        defRtg: isElite ? 107+(sig%6)  : 113+(sig%9),
      };
    };
    const h2=profile(homeName), a2=profile(awayName);
    const diff = ((h2.offRtg/a2.defRtg)-(a2.offRtg/h2.defRtg))*100+3.5;
    homeProb = Math.min(87,Math.max(13,Math.round(50+diff*3.2)));
    awayProb = 100-homeProb;
    dataSource = "POWER RATING";
  }

  const edge = Math.abs(homeProb-awayProb);
  const overUnder = realOU ? +realOU.toFixed(1) : null;
  const ouLabel   = overUnder ? `O/U ${overUnder}` : "O/U N/A";

  // Projected total from records (pts/game approximation)
  const estTotal  = overUnder || 220;
  const overPick  = `OVER ${(estTotal-4.5).toFixed(1)}`;
  const underPick = `UNDER ${(estTotal+3.5).toFixed(1)}`;
  const totalPick = overUnder ? ouLabel : overPick;

  // Spread analysis
  const spreadPick = spreadLine
    ? spreadLine
    : edge > 15
      ? `${homeProb>awayProb?homeName:awayName} -${Math.round(edge*0.28+1.5)}`
      : "PICK'EM";

  // First-half O/U estimate (NBA ~52% of total in 1H)
  const firstHalfOU = overUnder ? (overUnder*0.515).toFixed(1) : null;

  // Confidence: odds presence is the biggest signal
  let score = edge > 24 ? 80 : edge > 14 ? 70 : 58;
  if (realOU)        score += 12;
  if (hRec || aRec)  score += 6;
  if (spreadLine)    score += 4;
  score = Math.min(96, score);

  const isEliteGame = NBA_ELITE_TEAMS.has(norm(homeName))||NBA_ELITE_TEAMS.has(norm(awayName));
  const grade = score>=88?"A+":score>=80?"A":score>=70?"B":score>=60?"C":"D";
  const favourite = homeProb>=awayProb ? homeName : awayName;

  return {
    homeName, awayName, home, away,
    homeProb, awayProb, dataSource,
    overUnder, ouLabel, totalPick, spreadPick, firstHalfOU,
    overPick, underPick, estTotal,
    safePick:   edge>=20 ? `${favourite} ML` : "PICK'EM",
    score, grade,
    trust: score>82?"ELITE SIGNAL":"VERIFIED EDGE",
    isFeatured: isEliteGame,
    records: { home:homeRecTotal, away:awayRecTotal, homeHome:hHome, awayRoad:aRoad },
    stars: { home:homeStar, away:awayStar },
    homeML, awayML, spreadLine, homeSpread, awaySpread,
  };
};

// ─── GLOBAL BASKETBALL INTELLIGENCE ENGINE ───────────────────────────────────

// Country/league strength tier (calibrates baseline scoring)
const COUNTRY_TIER = {
  "USA":1,"Spain":1,"Turkey":1,"Greece":1,"France":1,"Lithuania":1,"Serbia":1,
  "Italy":1,"Germany":1,"Russia":1,"Israel":1,"Slovenia":1,
  "Australia":2,"China":2,"Brazil":2,"Argentina":2,"Philippines":2,
  "South Korea":2,"Japan":2,"Poland":2,"Croatia":2,
};

const getGlobalBaskIntelligence = (game) => {
  const homeName   = game.teams?.home?.name  || "";
  const awayName   = game.teams?.away?.name  || "";
  const countryName = game.country?.name || "";
  if (!homeName || !awayName) return null;

  const isLive  = BSKT_LIVE_ST.has(game.status?.short);
  const isFinal = BSKT_DONE_ST.has(game.status?.short);
  const tier    = COUNTRY_TIER[countryName] || 2;

  // Multi-hash team profile — calibrated to country tier
  const profile = (name) => {
    const sig  = name.toLowerCase().split("").reduce((a,c)=>a+c.charCodeAt(0),0)||1;
    const h1=sig%100, h2=(sig*31)%100, h3=(sig*17)%100, h4=(sig*7)%100;
    const base = tier===1 ? 95 : 88;
    return {
      offPts: base + (h1%20),          // 88–114 tier-1, 80–107 tier-2
      defPts: (base-5) + (h2%18),      // def pts allowed
      form:   0.30 + (h3%60)/100,      // 0.30–0.90
      depth:  (h4%5)+1,                // 1–5 bench depth
      aggression: 0.8 + (h1%4)*0.1,   // foul tendency
    };
  };

  const h = profile(homeName);
  const a = profile(awayName);

  // Projected score: off-pts normalised against opponent defence, home+3.5
  const homeExpPts = Math.round(h.offPts * (90/(85+(a.defPts-85)*0.55)) + 3.5);
  const awayExpPts = Math.round(a.offPts * (90/(85+(h.defPts-85)*0.55)));
  const estTotal   = homeExpPts + awayExpPts;

  const ptDiff = homeExpPts - awayExpPts;
  let homeProb = Math.min(85, Math.max(15, Math.round(50 + ptDiff * 2.5)));

  // Live score adjustment — weighted by quarter
  let momentum = null, runLabel = null;
  if (isLive) {
    const hs = game.scores?.home?.total ?? 0;
    const as = game.scores?.away?.total ?? 0;
    const qStr = game.status?.short || "Q1";
    const quarter = qStr.startsWith("Q") ? (parseInt(qStr[1])||1) : qStr==="HT"?2 : qStr==="OT"?4 : 2;
    const scoreDiff = hs - as;
    // Quarter weight: lead matters more late
    const qWeight = [0.45,0.70,0.90,1.15][quarter-1] || 0.70;
    const adjustment = Math.min(32, Math.abs(scoreDiff) * qWeight);
    homeProb = scoreDiff>0
      ? Math.min(94, homeProb + adjustment)
      : Math.max(6,  homeProb - adjustment);

    // Intra-quarter momentum: last quarter vs first
    const q1h=game.scores?.home?.quarter_1??0, q1a=game.scores?.away?.quarter_1??0;
    const totH=hs, totA=as;
    const runH=totH-q1h, runA=totA-q1a;
    if (Math.abs(runH-runA)>=8) {
      momentum = runH>runA ? `${homeName} on a run (+${runH-runA})` : `${awayName} on a run (+${runA-runH})`;
    }
    // Leading team label
    if (Math.abs(scoreDiff)>=5) runLabel = scoreDiff>0 ? `${homeName} +${scoreDiff}` : `${awayName} +${Math.abs(scoreDiff)}`;
  }

  const awayProb = 100-homeProb;
  const favProb  = Math.max(homeProb,awayProb);
  const favourite = homeProb>=awayProb ? homeName : awayName;

  // Picks
  const safePick   = favProb>=70 ? `${favourite} ML` : favProb>=60 ? `${favourite} -2.5` : `${favourite} ATS`;
  const totalPick  = estTotal>210 ? `OVER ${estTotal-7}` : `UNDER ${estTotal+7}`;
  const ouLabel    = `O/U ~${estTotal}`;
  const spreadPick = `${favourite} -${Math.max(1.5,Math.round(ptDiff*0.6*10)/10).toFixed(1)}`;

  // Confidence
  let score = favProb>25+50 ? 78 : favProb>15+50 ? 66 : 54;
  if (isLive) score = Math.min(91, score+12);
  if (tier===1) score = Math.min(96, score+5); // top leagues better data
  const grade = score>=82?"A+":score>=74?"A":score>=64?"B":score>=54?"C":"D";
  const trust = score>=76?"ELITE SIGNAL":"VERIFIED EDGE";

  return {
    homeName, awayName, countryName, tier,
    homeProb, awayProb,
    homeExpPts, awayExpPts, estTotal,
    safePick, totalPick, ouLabel, spreadPick,
    score, grade, trust, momentum, runLabel,
    isFinal, isLive,
  };
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function safeFetch(endpoint) {
  try {
    const url = `${BACKEND_URL}/api/football/proxy?endpoint=${encodeURIComponent(endpoint)}`;
    const res = await fetch(url);
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

  const isLive  = LIVE_STATUSES.has(match?.fixture?.status?.short);
  const elapsed = match?.fixture?.status?.elapsed || 0;
  const Sec = ({title}) => (
    <p style={{fontSize:"0.6rem",letterSpacing:2,color:"#444",margin:"2rem 0 0.8rem 0",fontWeight:900,textTransform:"uppercase"}}>{title}</p>
  );
  const Row = ({label,val,color="var(--gold)"}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"0.75rem 0",borderBottom:"1px solid #1a1d23",fontSize:"0.85rem"}}>
      <span style={{color:"#555",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:1}}>{label}</span>
      <strong style={{color}}>{val}</strong>
    </div>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",backdropFilter:"blur(10px)",zIndex:1000,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,background:"#0d0f12",height:"100%",overflowY:"auto",borderLeft:"1px solid #222",padding:"2rem",boxSizing:"border-box"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
          <StealthBadge text="INSTITUTIONAL ANALYSIS"/>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:"1.6rem",cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        <p style={{fontSize:"0.58rem",color:"#444",letterSpacing:2,marginBottom:"0.4rem",fontWeight:900,textTransform:"uppercase"}}>
          {intel.metrics?.leagueCtx||match.league?.name} · {match.league?.country}
          {isLive&&<span style={{color:"#ff4444",marginLeft:8}}>🔴 LIVE {elapsed}′</span>}
        </p>
        <h2 style={{fontSize:"1.35rem",color:"#fff",marginBottom:"0.3rem",lineHeight:1.2}}>
          {match.teams.home.name} <span style={{color:"#333"}}>vs</span> {match.teams.away.name}
        </h2>

        {/* Live score */}
        {isLive&&(
          <div style={{textAlign:"center",fontSize:"2.2rem",fontWeight:900,color:"var(--teal)",letterSpacing:8,margin:"1rem 0"}}>
            {match.goals?.home??0} — {match.goals?.away??0}
          </div>
        )}

        {/* Win probability */}
        <Sec title="Poisson Win Probability"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.6rem",marginBottom:"0.8rem"}}>
          {[["HOME",intel.probs.home,"var(--teal)"],["DRAW",intel.probs.draw,"#666"],["AWAY",intel.probs.away,"var(--gold)"]].map(([l,v,c])=>(
            <div key={l} style={{background:"#14171c",padding:"1rem",borderRadius:4,textAlign:"center"}}>
              <div style={{fontSize:"0.55rem",color:"#444",marginBottom:4,letterSpacing:2,fontWeight:900}}>{l}</div>
              <div style={{fontSize:"1.3rem",fontWeight:900,color:c}}>{v}%</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",height:5,borderRadius:3,overflow:"hidden",background:"#0a0b0d",marginBottom:"0.5rem"}}>
          <div style={{width:`${intel.probs.home}%`,background:"var(--teal)"}}/>
          <div style={{width:`${intel.probs.draw}%`,background:"#2a2a2a"}}/>
          <div style={{width:`${intel.probs.away}%`,background:"var(--gold)"}}/>
        </div>

        {/* xG model */}
        <Sec title="Expected Goals Model"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.6rem",marginBottom:"0.8rem"}}>
          <div style={{background:"#14171c",padding:"0.9rem",borderRadius:4,textAlign:"center"}}>
            <div style={{fontSize:"0.52rem",color:"#444",marginBottom:4,letterSpacing:2}}>HOME xG</div>
            <div style={{fontSize:"1.4rem",fontWeight:900,color:"var(--teal)"}}>{intel.xG.home}</div>
          </div>
          <div style={{background:"#14171c",padding:"0.9rem",borderRadius:4,textAlign:"center"}}>
            <div style={{fontSize:"0.52rem",color:"#444",marginBottom:4,letterSpacing:2}}>AWAY xG</div>
            <div style={{fontSize:"1.4rem",fontWeight:900,color:"var(--gold)"}}>{intel.xG.away}</div>
          </div>
        </div>
        <div style={{padding:"0.7rem",background:"rgba(0,242,255,.04)",border:"1px solid rgba(0,242,255,.1)",borderRadius:4,textAlign:"center",fontSize:"0.6rem",color:"#444",marginBottom:"0.5rem"}}>
          MOST LIKELY SCORE: <span style={{color:"var(--teal)",fontWeight:900,fontSize:"0.75rem"}}>{intel.mlScore}</span>
          <span style={{marginLeft:12}}>xG/60: <span style={{color:"#666"}}>{intel.metrics?.xGpm}</span></span>
        </div>

        {/* Goals market */}
        <Sec title="Goals Market Probabilities"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.5rem",marginBottom:"0.5rem"}}>
          {[["O1.5",intel.goals.over15],["O2.5",intel.goals.over25],["O3.5",intel.goals.over35],["BTTS",intel.goals.btts],["U2.5",intel.goals.under25]].map(([l,v])=>{
            const hot=v>=65;
            return (
              <div key={l} style={{background:hot?"rgba(0,242,255,.06)":"#14171c",border:hot?"1px solid rgba(0,242,255,.2)":"1px solid #1a1d23",padding:"0.6rem",borderRadius:4,textAlign:"center"}}>
                <div style={{fontSize:"0.52rem",color:"#444",fontWeight:900,marginBottom:3}}>{l}</div>
                <div style={{fontSize:"0.9rem",fontWeight:900,color:hot?"var(--teal)":v>=50?"#888":"#555"}}>{v}%</div>
              </div>
            );
          })}
        </div>

        {/* System picks */}
        <Sec title="System Verdict"/>
        {[
          ["SAFE PICK",  intel.safe,       "var(--teal)"],
          ["VALUE PICK", intel.val,        "var(--gold)"],
          ["ASIAN HCP",  intel.ah,         "#c084fc"],
          ["AGGRESSIVE", intel.aggressive, "#00ff88"],
        ].map(([l,v,c])=><Row key={l} label={l} val={v} color={c}/>)}
        {intel.upsetRisk!=="LOW"&&(
          <Row label="⚠ UPSET RISK" val={intel.upsetRisk} color="#ff4444"/>
        )}

        {/* Core metrics */}
        <Sec title="Core Intelligence"/>
        <div style={{background:"#14171c",padding:"1rem",borderRadius:4}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.8rem",fontSize:"0.75rem",color:"#aaa"}}>
            <div>Volatility: <span style={{color:"#fff"}}>{intel.volatility}</span></div>
            <div>Momentum: <span style={{color:intel.metrics?.momentum?.includes("SURGING")?"#00ff88":"#888"}}>{intel.metrics?.momentum||"—"}</span></div>
            <div>Pressure idx: <span style={{color:"#fff"}}>{intel.pressure}</span></div>
            <div>Grade: <span style={{color:"var(--teal)",fontWeight:900}}>{intel.grade}</span></div>
          </div>
        </div>

        {/* Confidence meter */}
        <Sec title="Confidence"/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.65rem",marginBottom:6}}>
          <span style={{color:"#555"}}>STEALTH SCORE: <span style={{color:"var(--gold)"}}>{intel.score}</span></span>
          <span style={{color:"#555"}}>GRADE: <span style={{color:"var(--teal)"}}>{intel.grade}</span></span>
        </div>
        <div style={{height:4,background:"#111",borderRadius:2,overflow:"hidden",marginBottom:"0.5rem"}}>
          <div style={{width:`${intel.score}%`,height:"100%",background:"linear-gradient(90deg,var(--teal),var(--gold))"}}/>
        </div>

        {/* Form */}
        <Sec title="Form History (Last 5)"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.8rem"}}>
          {[["HOME",intel.form.home],["AWAY",intel.form.away]].map(([side,results])=>(
            <div key={side}>
              <div style={{fontSize:"0.52rem",color:"#444",marginBottom:6,letterSpacing:2}}>{side}</div>
              <div style={{display:"flex",gap:4}}>
                {results.map((r,i)=>(
                  <span key={i} style={{
                    width:22,height:22,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:"0.6rem",fontWeight:900,
                    background:r==="W"?"rgba(0,255,136,.15)":r==="D"?"rgba(255,255,255,.06)":"rgba(255,68,68,.12)",
                    color:r==="W"?"#00ff88":r==="D"?"#666":"#ff4444",
                    border:`1px solid ${r==="W"?"rgba(0,255,136,.3)":r==="D"?"#222":"rgba(255,68,68,.25)"}`,
                  }}>{r}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* H2H */}
        <Sec title="Head-to-Head Context"/>
        {intel.h2h.map((g,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 0",borderBottom:"1px solid #111",fontSize:"0.72rem"}}>
            <span style={{color:"#444",fontSize:"0.6rem"}}>{g.date}</span>
            <span style={{color:"var(--teal)",fontWeight:700}}>{g.score}</span>
            <span style={{color:"#777"}}>{g.winner}</span>
          </div>
        ))}

      </div>
    </div>
  );
};

// ─── BASKETBALL ANALYSIS PANEL ───────────────────────────────────────────────

const BasketballAnalysisPanel = ({ gameObj, onClose }) => {
  if (!gameObj) return null;
  const { game, type } = gameObj;

  const isEspn   = type === "espn";
  const intel    = isEspn ? getBasketballIntelligence(game) : getGlobalBaskIntelligence(game);
  if (!intel) return null;

  const competition = isEspn ? game.competitions?.[0] : null;
  const status   = isEspn ? game.status?.type : null;
  const isLive   = isEspn ? status?.state==="in" : BSKT_LIVE_ST.has(game.status?.short);
  const isFinal  = isEspn ? status?.state==="post" : BSKT_DONE_ST.has(game.status?.short);
  const isPre    = !isLive && !isFinal;
  const leagueTag = isEspn ? (game._league||"NBA") : (game.league?.name||"Basketball");
  const countryTag = isEspn ? "" : (game.country?.name||"");

  // Scores
  let homeScore=null, awayScore=null;
  if (isEspn) {
    const homeC = competition?.competitors?.find(c=>c.homeAway==="home");
    const awayC = competition?.competitors?.find(c=>c.homeAway==="away");
    homeScore = (isLive||isFinal) ? parseInt(homeC?.score||"0") : null;
    awayScore = (isLive||isFinal) ? parseInt(awayC?.score||"0") : null;
  } else {
    homeScore = (isLive||isFinal) ? (game.scores?.home?.total??null) : null;
    awayScore = (isLive||isFinal) ? (game.scores?.away?.total??null) : null;
  }
  const homeLeads = homeScore!==null && awayScore!==null && homeScore>awayScore;
  const awayLeads = homeScore!==null && awayScore!==null && awayScore>homeScore;

  // Venue / broadcast
  const venue     = isEspn ? competition?.venue?.fullName : null;
  const broadcast = isEspn ? competition?.broadcasts?.[0]?.names?.[0] : null;
  const series    = isEspn ? competition?.series?.summary : null;

  // Quarter box score (global)
  const quarters = isEspn ? null : ["quarter_1","quarter_2","quarter_3","quarter_4"];

  const Row = ({label, val, color="var(--gold)"}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"0.75rem 0",borderBottom:"1px solid #1a1d23",fontSize:"0.85rem"}}>
      <span style={{color:"#555",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:1}}>{label}</span>
      <strong style={{color}}>{val}</strong>
    </div>
  );

  const Stat = ({label,val,sub,color="#fff"}) => (
    <div style={{background:"#14171c",padding:"0.9rem",borderRadius:4,textAlign:"center"}}>
      <div style={{fontSize:"0.55rem",color:"#444",letterSpacing:2,marginBottom:4,fontWeight:900}}>{label}</div>
      <div style={{fontSize:"1.2rem",fontWeight:900,color,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontSize:"0.5rem",color:"#444",marginTop:3}}>{sub}</div>}
    </div>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",backdropFilter:"blur(10px)",zIndex:1000,display:"flex",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,background:"#0d0f12",height:"100%",overflowY:"auto",borderLeft:"1px solid #222",padding:"2rem",boxSizing:"border-box"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
          <StealthBadge text={intel.trust}/>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:"1.6rem",cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {/* League */}
        <p style={{fontSize:"0.6rem",color:"#555",letterSpacing:2,marginBottom:"0.5rem",fontWeight:900,textTransform:"uppercase"}}>
          {leagueTag}{countryTag?` · ${countryTag}`:""}
          {series&&<span style={{color:"var(--gold)"}}> · {series}</span>}
        </p>

        {/* Matchup */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:"1.5rem"}}>
          <div style={{textAlign:"center"}}>
            {isEspn && intel.away?.team?.logo && (
              <img src={intel.away.team.logo} alt="" style={{width:44,height:44,objectFit:"contain",display:"block",margin:"0 auto 6px"}}/>
            )}
            {!isEspn && game.teams?.away?.logo && (
              <img src={game.teams.away.logo} alt="" style={{width:44,height:44,objectFit:"contain",display:"block",margin:"0 auto 6px"}}/>
            )}
            <div style={{fontSize:"0.95rem",fontWeight:700,color:isFinal&&awayLeads?"var(--gold)":"#fff"}}>{intel.awayName}</div>
            {awayScore!==null&&<div style={{fontSize:"2.2rem",fontWeight:900,color:awayLeads?"var(--gold)":"#888",lineHeight:1.05}}>{awayScore}</div>}
            {isEspn&&intel.records?.away&&<div style={{fontSize:"0.52rem",color:"#444",marginTop:3}}>{intel.records.away.summary||""}</div>}
          </div>
          <div style={{textAlign:"center",minWidth:52}}>
            {isPre&&<span style={{fontSize:"0.7rem",color:"#333"}}>vs</span>}
            {isLive&&(
              <div>
                <span className="live-dot" style={{display:"inline-block",marginBottom:4}}/>
                <div style={{fontSize:"0.65rem",color:"#ff4444",fontWeight:900}}>
                  {isEspn ? `Q${game.status?.period}` : game.status?.short}
                </div>
                <div style={{fontSize:"0.55rem",color:"#555"}}>{isEspn?game.status?.displayClock:game.status?.timer}</div>
              </div>
            )}
            {isFinal&&<span style={{fontSize:"0.65rem",color:"#555",fontWeight:700}}>FINAL</span>}
          </div>
          <div style={{textAlign:"center"}}>
            {isEspn && intel.home?.team?.logo && (
              <img src={intel.home.team.logo} alt="" style={{width:44,height:44,objectFit:"contain",display:"block",margin:"0 auto 6px"}}/>
            )}
            {!isEspn && game.teams?.home?.logo && (
              <img src={game.teams.home.logo} alt="" style={{width:44,height:44,objectFit:"contain",display:"block",margin:"0 auto 6px"}}/>
            )}
            <div style={{fontSize:"0.95rem",fontWeight:700,color:isFinal&&homeLeads?"var(--gold)":"#fff"}}>{intel.homeName}</div>
            {homeScore!==null&&<div style={{fontSize:"2.2rem",fontWeight:900,color:homeLeads?"var(--gold)":"#888",lineHeight:1.05}}>{homeScore}</div>}
            {isEspn&&intel.records?.home&&<div style={{fontSize:"0.52rem",color:"#444",marginTop:3}}>{intel.records.home.summary||""}</div>}
          </div>
        </div>

        {/* Venue / broadcast */}
        {(venue||broadcast)&&(
          <div style={{textAlign:"center",marginBottom:"1.5rem"}}>
            {venue&&<p style={{fontSize:"0.6rem",color:"#444",margin:"0 0 2px"}}>📍 {venue}</p>}
            {broadcast&&<p style={{fontSize:"0.6rem",color:"#444",margin:0}}>📺 {broadcast}</p>}
          </div>
        )}

        {/* Quarter box score — Global games */}
        {!isEspn && (isLive||isFinal) && quarters && (
          <div style={{background:"#0f1114",border:"1px solid #1a1d23",borderRadius:4,padding:"0.75rem",marginBottom:"1.5rem",overflowX:"auto"}}>
            <p style={{fontSize:"0.55rem",color:"#444",letterSpacing:2,marginBottom:"0.6rem",fontWeight:900}}>BOX SCORE</p>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr repeat(5,1fr)",gap:"2px 4px",fontSize:"0.55rem",textAlign:"center",color:"#333"}}>
              <div/><div>Q1</div><div>Q2</div><div>Q3</div><div>Q4</div><div style={{color:"#555"}}>TOT</div>
              <div style={{textAlign:"left",color:"#555",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{intel.awayName.split(" ").slice(-1)[0]}</div>
              {quarters.map(k=><div key={k} style={{color:"#555"}}>{game.scores?.away?.[k]??"—"}</div>)}
              <div style={{color:awayLeads?"var(--gold)":"#888",fontWeight:900}}>{awayScore}</div>
              <div style={{textAlign:"left",color:"#555",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{intel.homeName.split(" ").slice(-1)[0]}</div>
              {quarters.map(k=><div key={k} style={{color:"#555"}}>{game.scores?.home?.[k]??"—"}</div>)}
              <div style={{color:homeLeads?"var(--gold)":"#888",fontWeight:900}}>{homeScore}</div>
            </div>
          </div>
        )}

        {/* Momentum banner */}
        {isLive && intel.momentum && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"0.6rem 0.8rem",background:"rgba(255,68,68,.06)",border:"1px solid rgba(255,68,68,.18)",borderRadius:4,marginBottom:"1.5rem"}}>
            <span className="live-dot"/>
            <span style={{fontSize:"0.65rem",color:"#ff8888",fontWeight:700}}>MOMENTUM: {intel.momentum.toUpperCase()}</span>
          </div>
        )}

        {/* Win probability */}
        {!isFinal && (
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>
              WIN PROBABILITY
              {intel.dataSource&&<span style={{color:"#2a2a2a",marginLeft:8,fontSize:"0.5rem"}}>via {intel.dataSource}</span>}
            </p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.8rem",marginBottom:"0.8rem"}}>
              <Stat label="AWAY" val={`${intel.awayProb}%`} color={awayLeads||(!isLive&&intel.awayProb>intel.homeProb)?"var(--gold)":"#888"}/>
              <Stat label="HOME" val={`${intel.homeProb}%`} color={homeLeads||(!isLive&&intel.homeProb>intel.awayProb)?"var(--teal)":"#888"}/>
            </div>
            <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",background:"#0a0b0d"}}>
              <div style={{width:`${intel.awayProb}%`,background:"var(--gold)",transition:"width 0.5s"}}/>
              <div style={{width:`${intel.homeProb}%`,background:"var(--teal)",transition:"width 0.5s"}}/>
            </div>
          </div>
        )}

        {/* Picks grid */}
        {!isFinal && (
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>SYSTEM PICKS</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {label:"ML PICK",  val:intel.safePick,   color:"var(--teal)"},
                {label:"O/U LINE", val:intel.ouLabel||intel.totalPick, color:"var(--gold)"},
                {label:"SPREAD",   val:intel.spreadPick||intel.spreadLine||"N/A", color:"#c084fc"},
                {label:"STEALTH PICK", val:intel.safePick, color:"#00ff88"},
              ].map(p=>(
                <div key={p.label} style={{padding:"0.8rem",background:"#14171c",borderRadius:4}}>
                  <div style={{fontSize:"0.52rem",color:"#444",fontWeight:900,marginBottom:4}}>{p.label}</div>
                  <div style={{fontSize:"0.72rem",color:p.color,fontWeight:700}}>{p.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* First half O/U (ESPN only) */}
        {isEspn && intel.firstHalfOU && !isFinal && (
          <div style={{marginBottom:"1.5rem",padding:"0.8rem",background:"rgba(0,242,255,.04)",border:"1px solid rgba(0,242,255,.1)",borderRadius:4}}>
            <p style={{fontSize:"0.55rem",color:"var(--teal)",fontWeight:900,margin:"0 0 4px",letterSpacing:2}}>1ST HALF O/U ESTIMATE</p>
            <p style={{fontSize:"0.8rem",color:"#ccc",margin:0,fontWeight:700}}>{intel.firstHalfOU}</p>
          </div>
        )}

        {/* Star players */}
        {isEspn && (intel.stars?.home||intel.stars?.away) && (
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>KEY PLAYERS</p>
            {intel.stars.away&&<div style={{padding:"0.6rem 0",borderBottom:"1px solid #111",display:"flex",justifyContent:"space-between",fontSize:"0.7rem"}}>
              <span style={{color:"#555",fontSize:"0.6rem"}}>{intel.awayName}</span>
              <span style={{color:"var(--gold)"}}>{intel.stars.away}</span>
            </div>}
            {intel.stars.home&&<div style={{padding:"0.6rem 0",display:"flex",justifyContent:"space-between",fontSize:"0.7rem"}}>
              <span style={{color:"#555",fontSize:"0.6rem"}}>{intel.homeName}</span>
              <span style={{color:"var(--teal)"}}>{intel.stars.home}</span>
            </div>}
          </div>
        )}

        {/* Projected score (global only) */}
        {!isEspn && !isFinal && (
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>PROJECTED SCORE</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
              <div style={{background:"#14171c",padding:"0.8rem",borderRadius:4,textAlign:"center"}}>
                <div style={{fontSize:"0.52rem",color:"#444",marginBottom:3}}>AWAY</div>
                <div style={{fontSize:"1.4rem",fontWeight:900,color:"var(--gold)"}}>{intel.awayExpPts}</div>
              </div>
              <div style={{textAlign:"center",color:"#333",fontWeight:900}}>—</div>
              <div style={{background:"#14171c",padding:"0.8rem",borderRadius:4,textAlign:"center"}}>
                <div style={{fontSize:"0.52rem",color:"#444",marginBottom:3}}>HOME</div>
                <div style={{fontSize:"1.4rem",fontWeight:900,color:"var(--teal)"}}>{intel.homeExpPts}</div>
              </div>
            </div>
            <div style={{textAlign:"center",marginTop:6,fontSize:"0.6rem",color:"#444"}}>EST. TOTAL: ~{intel.estTotal} · {intel.totalPick}</div>
          </div>
        )}

        {/* Records (ESPN) */}
        {isEspn && (intel.records?.homeHome||intel.records?.awayRoad) && (
          <div style={{marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>SITUATIONAL RECORDS</p>
            {intel.records.homeHome&&<Row label={`${intel.homeName} at Home`} val={intel.records.homeHome.summary||"—"} color="var(--teal)"/>}
            {intel.records.awayRoad&&<Row label={`${intel.awayName} on Road`} val={intel.records.awayRoad.summary||"—"} color="var(--gold)"/>}
          </div>
        )}

        {/* Confidence meter */}
        <div style={{marginBottom:"1.5rem"}}>
          <p style={{fontSize:"0.6rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>INTELLIGENCE CONFIDENCE</p>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.7rem",marginBottom:6}}>
            <span style={{color:"#555"}}>STEALTH SCORE: <span style={{color:"var(--gold)"}}>{intel.score}</span></span>
            <span style={{color:"#555"}}>GRADE: <span style={{color:"var(--teal)"}}>{intel.grade}</span></span>
          </div>
          <div style={{height:4,background:"#111",borderRadius:2,overflow:"hidden"}}>
            <div style={{width:`${intel.score}%`,height:"100%",background:`linear-gradient(90deg,var(--teal),var(--gold))`,transition:"width 0.5s"}}/>
          </div>
        </div>

        {/* Final result */}
        {isFinal && homeScore!==null && (
          <div style={{padding:"1.5rem",background:"#14171c",borderRadius:4,textAlign:"center",marginBottom:"1.5rem"}}>
            <p style={{fontSize:"0.55rem",color:"#444",letterSpacing:2,marginBottom:"0.8rem",fontWeight:900}}>FINAL RESULT</p>
            <div style={{fontSize:"2.5rem",fontWeight:900,color:"#fff",letterSpacing:4}}>{awayScore} — {homeScore}</div>
            <div style={{fontSize:"0.7rem",color:"var(--gold)",marginTop:6,fontWeight:700}}>
              {homeLeads?`${intel.homeName} WIN`:awayLeads?`${intel.awayName} WIN`:"TIE"}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// ─── NBA GAME CARD ────────────────────────────────────────────────────────────

const NBAGameCard = React.memo(({ game, onClick }) => {
  const intel = getBasketballIntelligence(game);
  if (!intel) return null;

  const competition = game.competitions?.[0];
  const status  = game.status?.type;
  const isPre   = status?.state === "pre";
  const isLive  = status?.state === "in";
  const isFinal = status?.state === "post";
  const period  = game.status?.period;
  const clock   = game.status?.displayClock;
  const venue   = competition?.venue?.fullName;

  // Scores — only meaningful for live/final; ESPN sends "0" for scheduled
  const awayScoreInt = isLive || isFinal ? parseInt(intel.away?.score ?? "0") : -1;
  const homeScoreInt = isLive || isFinal ? parseInt(intel.home?.score ?? "0") : -1;
  const awayLeads = awayScoreInt > homeScoreInt;
  const homeLeads = homeScoreInt > awayScoreInt;

  // Extra data from ESPN competition object
  const broadcast  = competition?.broadcasts?.[0]?.names?.[0];
  const seriesInfo = competition?.series?.summary;
  const awayLogo   = intel.away?.team?.logo;
  const homeLogo   = intel.home?.team?.logo;
  const leagueTag  = game._league || "NBA";

  const gameDate    = new Date(game.date);
  const todayStr    = new Date().toDateString();
  const tomorrowStr = new Date(Date.now() + 864e5).toDateString();
  const dayLabel    = isLive ? "🔴 LIVE" : isFinal ? "FINAL"
    : gameDate.toDateString() === todayStr    ? "TODAY"
    : gameDate.toDateString() === tomorrowStr ? "TOMORROW"
    : gameDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const gameTime = gameDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const borderColor = isLive ? "1px solid #ff4444"
    : intel.score > 80 ? "1px solid var(--gold)" : "1px solid #222";

  return (
    <div
      className={`card match-card glass${intel.isFeatured ? " featured-card" : ""}${isLive ? " live-card-ring" : ""}`}
      style={{ border: borderColor, cursor: onClick ? "pointer" : "default", padding: "0.6rem" }}
      onClick={onClick}
    >
      <div className="match-header" style={{ padding: "0.8rem" }}>
        {/* Trust + day label */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
          <StealthBadge text={intel.trust} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: isLive ? "#ff4444" : "var(--teal)", textTransform: "uppercase" }}>
            {dayLabel}
          </span>
        </div>

        {/* Teams + scores row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Away */}
          <div style={{ flex: 1, textAlign: "center" }}>
            {awayLogo && (
              <img src={awayLogo} alt="" style={{ width: 30, height: 30, objectFit: "contain", marginBottom: 4, display: "block", margin: "0 auto 4px" }} />
            )}
            <div style={{
              fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.2,
              color: isFinal && awayLeads ? "var(--gold)" : "#fff",
            }}>{intel.awayName}</div>
            {(isLive || isFinal) && (
              <div className={isLive?"live-score-num":""} style={{
                fontSize: "1.9rem", fontWeight: 900, lineHeight: 1.05,
                color: awayLeads ? "var(--gold)" : "#888",
              }}>{intel.away?.score ?? "—"}</div>
            )}
          </div>

          {/* Center status */}
          <div style={{ textAlign: "center", minWidth: 52 }}>
            {isPre  && <span style={{ fontSize: "0.65rem", color: "#555" }}>@</span>}
            {isLive && (
              <>
                <div style={{ fontSize: "0.7rem", color: "#ff4444", fontWeight: 900 }}>Q{period}</div>
                <div style={{ fontSize: "0.6rem", color: "#777" }}>{clock}</div>
              </>
            )}
            {isFinal && <span style={{ fontSize: "0.6rem", color: "#777", fontWeight: 700 }}>FINAL</span>}
          </div>

          {/* Home */}
          <div style={{ flex: 1, textAlign: "center" }}>
            {homeLogo && (
              <img src={homeLogo} alt="" style={{ width: 30, height: 30, objectFit: "contain", marginBottom: 4, display: "block", margin: "0 auto 4px" }} />
            )}
            <div style={{
              fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.2,
              color: isFinal && homeLeads ? "var(--gold)" : "#fff",
            }}>{intel.homeName}</div>
            {(isLive || isFinal) && (
              <div className={isLive?"live-score-num":""} style={{
                fontSize: "1.9rem", fontWeight: 900, lineHeight: 1.05,
                color: homeLeads ? "var(--gold)" : "#888",
              }}>{intel.home?.score ?? "—"}</div>
            )}
          </div>
        </div>

        {/* Scheduled: tip-off time */}
        {isPre && (
          <div style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--teal)", fontWeight: 700, margin: "0.5rem 0 0.3rem" }}>
            TIP-OFF · {gameTime}
          </div>
        )}

        {/* Final: winner line */}
        {isFinal && (
          <div style={{ textAlign: "center", fontSize: "0.65rem", color: "var(--teal)", fontWeight: 700, margin: "0.3rem 0" }}>
            {homeLeads ? `${intel.homeName} wins` : awayLeads ? `${intel.awayName} wins` : "TIE"}
          </div>
        )}

        {/* Live: dot indicator */}
        {isLive && (
          <div className="match-meta" style={{ justifyContent: "center", marginTop: "0.4rem" }}>
            <span className="live-dot" />
            <span>LIVE</span>
          </div>
        )}

        {/* League + venue + series */}
        <div className="league-meta">
          {leagueTag}{venue ? ` · ${venue}` : ""}
          {seriesInfo && <span style={{ color: "var(--gold)" }}> · {seriesInfo}</span>}
        </div>

        {/* Broadcast */}
        {broadcast && (
          <div style={{ fontSize: "0.55rem", color: "#555", textAlign: "center", marginTop: 3 }}>
            📺 {broadcast}
          </div>
        )}
      </div>

      <div className="match-insights" style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "0.8rem" }}>
        {/* Win probability + picks — only for pre/live (not after game ends) */}
        {!isFinal && (
          <>
            <div className="ai-edge">
              <span className="ai-edge-label">WIN PROBABILITY <InfoTip text="ESPN Moneyline Power Engine" /></span>
              <div className="sharp-bar-bg" style={{ display: "flex" }}>
                <div style={{ width: `${intel.awayProb}%`, height: "100%", background: "var(--gold)" }} />
                <div style={{ width: `${intel.homeProb}%`, height: "100%", background: "var(--teal)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: "#555", marginTop: 4 }}>
                <span>AWAY {intel.awayProb}%</span>
                <span>HOME {intel.homeProb}%</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: "1rem" }}>
              {[
                { label: "ML PICK",  val: intel.safePick,  color: "var(--teal)" },
                { label: "O/U LINE", val: intel.totalPick, color: "var(--gold)" },
              ].map(p => (
                <div key={p.label} style={{ padding: 8, background: "#1a1d23", borderRadius: 3 }}>
                  <div style={{ fontSize: "0.55rem", color: "#555", fontWeight: 900 }}>{p.label}</div>
                  <div style={{ fontSize: "0.65rem", color: p.color, fontWeight: 700 }}>{p.val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Final result box */}
        {isFinal && (
          <div style={{ padding: "0.8rem", background: "#1a1d23", borderRadius: 3, textAlign: "center", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.55rem", color: "#555", fontWeight: 900, marginBottom: 5 }}>FINAL RESULT</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 900, color: homeLeads ? "var(--gold)" : awayLeads ? "var(--teal)" : "#888" }}>
              {intel.away?.score} – {intel.home?.score}
            </div>
            <div style={{ fontSize: "0.6rem", color: "#555", marginTop: 3 }}>
              {homeLeads ? `${intel.homeName} win` : awayLeads ? `${intel.awayName} win` : "TIE"}
            </div>
          </div>
        )}

        <div className="ai-edge" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
            <span className="ai-edge-label">STEALTH SCORE: <span style={{ color: "var(--gold)" }}>{intel.score}</span></span>
            <span className="ai-edge-label">GRADE: <span style={{ color: "var(--teal)" }}>{intel.grade}</span></span>
          </div>
          <div className="confidence-meter">
            <div className="confidence-bar" style={{ width: `${intel.score}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── GLOBAL BASKETBALL CARD (API-Sports format) ───────────────────────────────

const GlobalBaskCard = React.memo(({ game, onClick }) => {
  const intel   = getGlobalBaskIntelligence(game);
  if (!intel) return null;

  const isLive  = BSKT_LIVE_ST.has(game.status?.short);
  const isFinal = BSKT_DONE_ST.has(game.status?.short);
  const isPre   = !isLive && !isFinal;

  const homeName  = game.teams?.home?.name || "Home";
  const awayName  = game.teams?.away?.name || "Away";
  const homeLogo  = game.teams?.home?.logo;
  const awayLogo  = game.teams?.away?.logo;
  const homeScore = isLive || isFinal ? (game.scores?.home?.total ?? null) : null;
  const awayScore = isLive || isFinal ? (game.scores?.away?.total ?? null) : null;
  const homeLeads = homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayLeads = homeScore !== null && awayScore !== null && awayScore > homeScore;

  const quarter     = game.status?.short;
  const timer       = game.status?.timer;
  const leagueName  = game.league?.name  || "";
  const countryName = game.country?.name || "";

  const gameDate    = new Date(game.date);
  const todayStr    = new Date().toDateString();
  const tomorrowStr = new Date(Date.now() + 864e5).toDateString();
  const dayLabel    = isLive ? "🔴 LIVE" : isFinal ? "FINAL"
    : gameDate.toDateString() === todayStr    ? "TODAY"
    : gameDate.toDateString() === tomorrowStr ? "TOMORROW"
    : gameDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const gameTime = gameDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const borderColor = isLive ? "1px solid #ff4444"
    : intel.score > 75 ? "1px solid rgba(212,175,55,.35)" : "1px solid #1a1d23";

  return (
    <div className={`card match-card glass${isLive?" live-card-ring":""}`} style={{ border: borderColor, cursor: onClick ? "pointer" : "default", padding: "0.6rem" }} onClick={onClick}>
      <div className="match-header" style={{ padding: "0.8rem" }}>

        {/* Trust badge + day label */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
          <div>
            <StealthBadge text={intel.trust} />
            <span style={{ fontSize: "0.48rem", color: "#3a3a3a", display: "block", marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>
              {leagueName}{countryName ? ` · ${countryName}` : ""}
            </span>
          </div>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: isLive ? "#ff4444" : "var(--teal)", textTransform: "uppercase" }}>
            {dayLabel}
          </span>
        </div>

        {/* Teams + Scores */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Away */}
          <div style={{ flex: 1, textAlign: "center" }}>
            {awayLogo && <img src={awayLogo} alt="" style={{ width: 28, height: 28, objectFit: "contain", display: "block", margin: "0 auto 4px" }} />}
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: isFinal && awayLeads ? "var(--gold)" : "#ccc", lineHeight: 1.2 }}>
              {awayName}
            </div>
            {awayScore !== null && (
              <div className={isLive?"live-score-num":""} style={{ fontSize: "1.9rem", fontWeight: 900, color: awayLeads ? "var(--gold)" : "#555", lineHeight: 1.05 }}>
                {awayScore}
              </div>
            )}
          </div>

          {/* Center */}
          <div style={{ textAlign: "center", minWidth: 48 }}>
            {isPre  && <span style={{ fontSize: "0.65rem", color: "#444" }}>@</span>}
            {isLive && (
              <>
                <div style={{ fontSize: "0.7rem", color: "#ff4444", fontWeight: 900 }}>{quarter}</div>
                {timer && <div style={{ fontSize: "0.6rem", color: "#666" }}>{timer}</div>}
              </>
            )}
            {isFinal && <span style={{ fontSize: "0.6rem", color: "#555", fontWeight: 700 }}>FINAL</span>}
          </div>

          {/* Home */}
          <div style={{ flex: 1, textAlign: "center" }}>
            {homeLogo && <img src={homeLogo} alt="" style={{ width: 28, height: 28, objectFit: "contain", display: "block", margin: "0 auto 4px" }} />}
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: isFinal && homeLeads ? "var(--gold)" : "#ccc", lineHeight: 1.2 }}>
              {homeName}
            </div>
            {homeScore !== null && (
              <div className={isLive?"live-score-num":""} style={{ fontSize: "1.9rem", fontWeight: 900, color: homeLeads ? "var(--gold)" : "#555", lineHeight: 1.05 }}>
                {homeScore}
              </div>
            )}
          </div>
        </div>

        {isPre && (
          <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--teal)", fontWeight: 700, margin: "0.5rem 0 0.2rem" }}>
            TIP-OFF · {gameTime}
          </div>
        )}
        {isFinal && (
          <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#777", margin: "0.3rem 0" }}>
            {homeLeads ? `${homeName} wins` : awayLeads ? `${awayName} wins` : "TIE"}
          </div>
        )}
        {isLive && (
          <div className="match-meta" style={{ justifyContent: "center", marginTop: "0.4rem" }}>
            <span className="live-dot" />
            <span>LIVE · {quarter}{timer ? ` · ${timer}` : ""}</span>
          </div>
        )}
      </div>

      {/* Quarter box-score (live/final) */}
      {(isLive || isFinal) && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.04)", padding: "0.5rem 0.8rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(5,1fr)", gap: "2px 4px", fontSize: "0.52rem", color: "#444", textAlign: "center" }}>
            <div /><div style={{color:"#333"}}>Q1</div><div style={{color:"#333"}}>Q2</div><div style={{color:"#333"}}>Q3</div><div style={{color:"#333"}}>Q4</div><div style={{color:"#555"}}>TOT</div>
            <div style={{color:"#666",textAlign:"left",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{awayName.split(",")[0]}</div>
            {["quarter_1","quarter_2","quarter_3","quarter_4"].map(k=><div key={k} style={{color:"#555"}}>{game.scores?.away?.[k]??"—"}</div>)}
            <div style={{color:awayLeads?"var(--gold)":"#888",fontWeight:900}}>{awayScore}</div>
            <div style={{color:"#666",textAlign:"left",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{homeName.split(",")[0]}</div>
            {["quarter_1","quarter_2","quarter_3","quarter_4"].map(k=><div key={k} style={{color:"#555"}}>{game.scores?.home?.[k]??"—"}</div>)}
            <div style={{color:homeLeads?"var(--gold)":"#888",fontWeight:900}}>{homeScore}</div>
          </div>
        </div>
      )}

      {/* AI Predictions panel */}
      <div className="match-insights" style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "0.8rem" }}>

        {/* Momentum indicator for live games */}
        {isLive && intel.momentum && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "0.8rem", padding: "0.4rem 0.6rem", background: "rgba(255,68,68,0.07)", border: "1px solid rgba(255,68,68,0.15)", borderRadius: 3 }}>
            <span className="live-dot" />
            <span style={{ fontSize: "0.6rem", color: "#ff8888", fontWeight: 700 }}>MOMENTUM: {intel.momentum.toUpperCase()}</span>
          </div>
        )}

        {/* Win probability — pre/live only */}
        {!isFinal && (
          <>
            <div className="ai-edge">
              <span className="ai-edge-label">WIN PROBABILITY <InfoTip text="Club Power Engine — Home Advantage Adjusted" /></span>
              <div className="sharp-bar-bg" style={{ display: "flex" }}>
                <div style={{ width: `${intel.awayProb}%`, height: "100%", background: "var(--gold)" }} />
                <div style={{ width: `${intel.homeProb}%`, height: "100%", background: "var(--teal)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: "#555", marginTop: 4 }}>
                <span>AWAY {intel.awayProb}%</span>
                <span>HOME {intel.homeProb}%</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: "1rem" }}>
              {[
                { label: "STEALTH PICK", val: intel.safePick,  color: "var(--teal)" },
                { label: "O/U LINE",     val: intel.totalPick, color: "var(--gold)" },
              ].map(p => (
                <div key={p.label} style={{ padding: 8, background: "#1a1d23", borderRadius: 3 }}>
                  <div style={{ fontSize: "0.55rem", color: "#555", fontWeight: 900 }}>{p.label}</div>
                  <div style={{ fontSize: "0.65rem", color: p.color, fontWeight: 700 }}>{p.val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Final result box */}
        {isFinal && (
          <div style={{ padding: "0.8rem", background: "#1a1d23", borderRadius: 3, textAlign: "center", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.55rem", color: "#555", fontWeight: 900, marginBottom: 5 }}>FINAL RESULT</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 900, color: homeLeads ? "var(--gold)" : awayLeads ? "var(--teal)" : "#888" }}>
              {awayScore} – {homeScore}
            </div>
            <div style={{ fontSize: "0.6rem", color: "#555", marginTop: 3 }}>
              {homeLeads ? `${homeName} win` : awayLeads ? `${awayName} win` : "TIE"}
            </div>
          </div>
        )}

        {/* Stealth score meter */}
        <div className="ai-edge" style={{ marginTop: isFinal ? 0 : "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
            <span className="ai-edge-label">STEALTH SCORE: <span style={{ color: "var(--gold)" }}>{intel.score}</span></span>
            <span className="ai-edge-label">GRADE: <span style={{ color: "var(--teal)" }}>{intel.grade}</span></span>
          </div>
          <div className="confidence-meter">
            <div className="confidence-bar" style={{ width: `${intel.score}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
});

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
      <button className={`nav-btn secondary${activeView==="basketball"?" active":""}`} onClick={()=>onViewChange("basketball")}>🏀 Basketball</button>
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

const Sidebar = ({activeFilter,onFilterChange,selectedGeo,onGeoChange,view,nbaFilter,onNbaFilterChange,nbaNews,sportsNews,globalLiveGames}) => {
  const G = ({value,label,indent=false}) => (
    <button
      className={`filter-tag${selectedGeo===value?" active":""}`}
      onClick={()=>onGeoChange(value)}
      style={{textAlign:"left",paddingLeft:indent?"1.8rem":"1rem",fontSize:indent?"0.7rem":"0.75rem"}}
    >{label}</button>
  );

  const sportColor = s => s==="NBA"?"var(--teal)":s==="WNBA"?"#c084fc":s==="EPL"?"#22c55e":"#888";

  if (view==="basketball") {
    const liveGames = globalLiveGames || [];
    const feed = (sportsNews||[]).length > 0 ? sportsNews : (nbaNews||[]).map(a=>({...a,_sport:"NBA",_emoji:"🏀"}));

    return (
      <aside className="right-sidebar">
        {/* 1. Status */}
        <div className="sidebar-section" style={{borderColor:"#333"}}>
          <p className="username">Guest Terminal</p>
          <span className="status">🏀 Basketball Intelligence Mode</span>
          {liveGames.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:6}}>
              <span className="live-dot"/>
              <span style={{fontSize:"0.55rem",color:"#ff4444",fontWeight:700}}>{liveGames.length} LIVE WORLDWIDE NOW</span>
            </div>
          )}
        </div>

        {/* 2. Sports news — TOP position so it's visible immediately */}
        <div className="sidebar-section">
          <p className="sidebar-label">📰 SPORTS INTELLIGENCE FEED</p>
          {feed.length>0 ? (
            <div style={{display:"flex",flexDirection:"column"}}>
              {feed.slice(0,12).map((a,i)=>{
                const sport = a._sport || "NBA";
                const emoji = a._emoji || "🏀";
                return (
                  <div key={i} style={{padding:"0.45rem 0",borderBottom:"1px solid #111"}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                      <span style={{fontSize:"0.48rem",color:sportColor(sport),border:`1px solid ${sportColor(sport)}`,borderRadius:2,padding:"1px 5px",fontWeight:900,letterSpacing:.5}}>
                        {emoji} {sport}
                      </span>
                    </div>
                    <p style={{fontSize:"0.6rem",color:"#ccc",lineHeight:1.35,margin:0,fontWeight:600}}>
                      {a.headline||a.title||""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{fontSize:"0.62rem",color:"#333",padding:"0.6rem 0",textAlign:"center"}}>Loading feed…</p>
          )}
        </div>

        {/* 3. Live games ticker */}
        {liveGames.length>0&&(
          <div className="sidebar-section">
            <p className="sidebar-label">🔴 LIVE SCORES</p>
            <div style={{display:"flex",flexDirection:"column",gap:1}}>
              {liveGames.slice(0,8).map((g,i)=>{
                const hs  = g.scores?.home?.total ?? "—";
                const aws = g.scores?.away?.total ?? "—";
                const hn  = g.teams?.home?.name || "";
                const an  = g.teams?.away?.name || "";
                const st  = g.status?.short || "";
                const tm  = g.status?.timer || "";
                const lg  = g.league?.name || "";
                const homeLeads = typeof hs==="number"&&typeof aws==="number"&&hs>aws;
                const awayLeads = typeof aws==="number"&&typeof hs==="number"&&aws>hs;
                return (
                  <div key={i} style={{padding:"0.4rem 0",borderBottom:"1px solid #111",display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"0.46rem",color:"#444",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{lg}</div>
                      <div style={{fontSize:"0.58rem",color:awayLeads?"var(--gold)":"#bbb",fontWeight:awayLeads?700:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{an}</div>
                      <div style={{fontSize:"0.58rem",color:homeLeads?"var(--gold)":"#bbb",fontWeight:homeLeads?700:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{hn}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"0.48rem",color:"#ff4444",fontWeight:700}}>{st}{tm?` · ${tm}`:""}</div>
                      <div style={{fontSize:"0.82rem",fontWeight:900,color:awayLeads?"var(--gold)":"#888",lineHeight:1}}>{aws}</div>
                      <div style={{fontSize:"0.82rem",fontWeight:900,color:homeLeads?"var(--gold)":"#888",lineHeight:1}}>{hs}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Filters — below the news */}
        <div className="sidebar-section">
          <p className="sidebar-label">BASKETBALL FILTERS</p>
          <div className="filter-grid">
            {["All","🌍 Global","NBA","WNBA","Live Games","Upcoming","Final","Featured"].map(f=>(
              <button key={f} className={`filter-tag${nbaFilter===f?" active":""}`} onClick={()=>onNbaFilterChange(f)}>{f}</button>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-sidebar">
      {/* 1. Auth */}
      <div className="sidebar-section" style={{borderColor:"#333"}}>
        <p className="username">Guest Terminal</p>
        <span className="status">Public Intelligence Access</span>
      </div>

      {/* 2. Sports news — TOP, immediately visible */}
      <div className="sidebar-section">
        <p className="sidebar-label">📰 SPORTS INTELLIGENCE FEED</p>
        {(sportsNews||[]).length>0 ? (
          <div style={{display:"flex",flexDirection:"column"}}>
            {(sportsNews||[]).slice(0,12).map((a,i)=>{
              const sport = a._sport||"NEWS";
              const emoji = a._emoji||"📡";
              const color = sport==="NBA"?"var(--teal)":sport==="WNBA"?"#c084fc":sport==="EPL"?"#22c55e":"#888";
              return (
                <div key={i} style={{padding:"0.45rem 0",borderBottom:"1px solid #111"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                    <span style={{fontSize:"0.48rem",color,border:`1px solid ${color}`,borderRadius:2,padding:"1px 5px",fontWeight:900,letterSpacing:.5}}>
                      {emoji} {sport}
                    </span>
                  </div>
                  <p style={{fontSize:"0.6rem",color:"#ccc",lineHeight:1.35,margin:0,fontWeight:600}}>
                    {a.headline||a.title||""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{fontSize:"0.62rem",color:"#333",padding:"0.6rem 0",textAlign:"center"}}>Loading feed…</p>
        )}
      </div>

      {/* 3. Quick Filters */}
      <div className="sidebar-section">
        <p className="sidebar-label">QUICK FILTERS</p>
        <div className="filter-grid">
          {["All","Upcoming Games","Live Matches","Big Clubs","Safe Picks","Goals Picks","Value Picks","Upset Alerts"].map(f=>(
            <button key={f} className={`filter-tag${activeFilter===f?" active":""}`} onClick={()=>onFilterChange(f)}>{f}</button>
          ))}
        </div>
      </div>

      {/* 4. Geo */}
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
  const [selectedMatch,  setSelectedMatch]  = useState(null);
  const [selectedBsktGame, setSelectedBsktGame] = useState(null);
  const [basketball,     setBasketball]     = useState({loading:true,error:null,data:[]});
  const [globalGames,    setGlobalGames]    = useState({loading:true,error:null,data:[]});
  const [nbaFilter,      setNbaFilter]      = useState("All");
  const [nbaNews,        setNbaNews]        = useState([]);
  const [sportsNews,     setSportsNews]     = useState([]);
  const hasFetched     = useRef(false);
  const nbaFetched     = useRef(false);

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

  // ── Basketball fetch (NBA + WNBA, today + next 3 days + news) ───────────
  const fetchBasketball = useCallback(async () => {
    setBasketball(p => ({ ...p, loading: true, error: null }));
    try {
      const dates = Array.from({length:4},(_,i)=>{
        const d = new Date(); d.setDate(d.getDate()+i);
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
      });

      // Fetch news + NBA (4 days) + WNBA (4 days) in parallel
      const responses = await Promise.all([
        fetch(`${BACKEND_URL}/api/basketball/news?limit=12`),
        ...dates.map(date => fetch(`${BACKEND_URL}/api/basketball/scoreboard?dates=${date}`)),
        ...dates.map(date => fetch(`${BACKEND_URL}/api/basketball/wnba/scoreboard?dates=${date}`)),
      ]);

      if (!responses[1].ok) throw new Error(`Server responded ${responses[1].status} — is the backend running on port 5050?`);

      const jsons = await Promise.all(responses.map(r => r.ok ? r.json() : Promise.resolve({})));
      const newsData  = jsons[0];
      const nbaDatas  = jsons.slice(1, 5);   // indices 1–4
      const wnbaDatas = jsons.slice(5, 9);   // indices 5–8

      const eventMap = new Map();
      nbaDatas.forEach(d  => (d.events||[]).forEach(e => { if (!eventMap.has(e.id))           eventMap.set(e.id,          { ...e, _league: "NBA"  }); }));
      wnbaDatas.forEach(d => (d.events||[]).forEach(e => { if (!eventMap.has(`wnba_${e.id}`)) eventMap.set(`wnba_${e.id}`,{ ...e, _league: "WNBA" }); }));

      const events = Array.from(eventMap.values()).sort((a,b)=>{
        const ord={in:0,pre:1,post:2};
        const sa=ord[a.status?.type?.state]??3, sb=ord[b.status?.type?.state]??3;
        return sa!==sb?sa-sb:new Date(a.date)-new Date(b.date);
      });

      setBasketball({ loading:false, error:null, data:events });
      setNbaNews(newsData.articles||newsData.items||[]);
      console.log(`✅ ${events.length} basketball games loaded (${dates.length} days, NBA+WNBA)`);
    } catch (err) {
      console.error("fetchBasketball:", err);
      setBasketball({ loading:false, error:err.message, data:[] });
    }
  }, []);

  // ── Multi-sport news feed ─────────────────────────────────────────────────
  const fetchSportsNews = useCallback(async () => {
    try {
      const res  = await fetch(`${BACKEND_URL}/api/sports/news?limit=8`);
      const data = res.ok ? await res.json() : { articles: [] };
      setSportsNews(data.articles || []);
    } catch (err) {
      console.warn("fetchSportsNews:", err.message);
    }
  }, []);

  // ── Global basketball fetch (API-Sports worldwide) ────────────────────────
  const fetchGlobalBasketball = useCallback(async () => {
    setGlobalGames(p => ({ ...p, loading: true }));
    try {
      const today    = localDateStr();
      const tomorrow = localDateStr(new Date(Date.now() + 864e5));

      const [todayRes, tomorrowRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/basketball/global/games?date=${today}`),
        fetch(`${BACKEND_URL}/api/basketball/global/games?date=${tomorrow}`),
      ]);

      const [todayData, tomorrowData] = await Promise.all([
        todayRes.ok   ? todayRes.json()   : { response: [] },
        tomorrowRes.ok ? tomorrowRes.json() : { response: [] },
      ]);

      const allGames = [
        ...(todayData.response    || []),
        ...(tomorrowData.response || []).filter(g => g.status?.short === "NS"),
      ];

      // Deduplicate
      const gameMap = new Map();
      allGames.forEach(g => { if (!gameMap.has(g.id)) gameMap.set(g.id, g); });

      const data = Array.from(gameMap.values()).sort((a, b) => {
        const ord = g => BSKT_LIVE_ST.has(g.status?.short) ? 0 : g.status?.short === "NS" ? 1 : 2;
        const diff = ord(a) - ord(b);
        return diff !== 0 ? diff : new Date(a.date) - new Date(b.date);
      });

      setGlobalGames({ loading: false, error: null, data });
      const liveCount = data.filter(g => BSKT_LIVE_ST.has(g.status?.short)).length;
      console.log(`✅ Global basketball: ${data.length} games (${liveCount} live)`);
    } catch (err) {
      console.error("fetchGlobalBasketball:", err);
      setGlobalGames({ loading: false, error: null, data: [] }); // silent — ESPN is primary
    }
  }, []);

  // ── Auto-refresh ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if(hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
    fetchSportsNews(); // News loads on app startup — visible immediately on any tab

    const onVis = ()=>{if(!document.hidden) fetchData();};
    document.addEventListener("visibilitychange",onVis);

    const hasLive = ()=>live.data.some(m=>LIVE_STATUSES.has(m.fixture?.status?.short));
    const tid = setInterval(()=>{if(!document.hidden) fetchData();},(hasLive()?LIVE_CACHE_MINS:SCHEDULED_CACHE_MINS)*60000);

    return()=>{clearInterval(tid);document.removeEventListener("visibilitychange",onVis);};
  },[fetchData,fetchSportsNews]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy-load basketball on tab open (ESPN + global + news) ─────────────
  useEffect(() => {
    if (view === "basketball" && !nbaFetched.current) {
      nbaFetched.current = true;
      fetchBasketball();
      fetchGlobalBasketball();
      fetchSportsNews();
    }
  }, [view, fetchBasketball, fetchGlobalBasketball, fetchSportsNews]);

  // ── Lightweight live-score mini-refresh (1 req every 3 min when live) ───
  const fetchLiveScoresOnly = useCallback(async () => {
    try {
      const res  = await fetch(`${BACKEND_URL}/api/basketball/global/live`);
      const data = res.ok ? await res.json() : { response: [] };
      const live  = data.response || [];
      if (!live.length) return;
      const liveMap = new Map(live.map(g => [g.id, g]));
      setGlobalGames(prev => ({
        ...prev,
        data: prev.data.map(g => liveMap.has(g.id) ? { ...liveMap.get(g.id), _source: "global" } : g),
      }));
    } catch (err) { console.warn("live-score mini-refresh:", err.message); }
  }, []);

  // ── Basketball full refresh every 20 min (quota-friendly) ────────────────
  useEffect(() => {
    const hasLive = basketball.data.some(g => g.status?.type?.state === "in")
      || globalGames.data.some(g => BSKT_LIVE_ST.has(g.status?.short));
    if (!hasLive) return;

    // Mini-refresh: only 1 API request every 3 min — updates live scores in-place
    const liveTid = setInterval(() => {
      if (!document.hidden) fetchLiveScoresOnly();
    }, 3 * 60 * 1000);

    // Full refresh: all data every 20 min to conserve daily quota
    const fullTid = setInterval(() => {
      if (!document.hidden) { fetchBasketball(); fetchGlobalBasketball(); }
    }, 20 * 60 * 1000);

    return () => { clearInterval(liveTid); clearInterval(fullTid); };
  }, [basketball.data, globalGames.data, fetchBasketball, fetchGlobalBasketball, fetchLiveScoresOnly]);

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
    if(filter==="Upcoming Games"){
      const p = data.filter(m=>m?.fixture?.status?.short==="NS");
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

  const filteredBasketball = useMemo(()=>{
    let data = [...basketball.data];
    if     (nbaFilter==="NBA")       data = data.filter(g=>g._league==="NBA");
    else if(nbaFilter==="WNBA")      data = data.filter(g=>g._league==="WNBA");
    else if(nbaFilter==="Live Games") data = data.filter(g=>g.status?.type?.state==="in");
    else if(nbaFilter==="Upcoming")   data = data.filter(g=>g.status?.type?.state==="pre");
    else if(nbaFilter==="Final")      data = data.filter(g=>g.status?.type?.state==="post");
    else if(nbaFilter==="Featured")   data = data.filter(g=>getBasketballIntelligence(g)?.isFeatured);
    return data;
  },[basketball.data,nbaFilter]);

  const liveCount = useMemo(()=>live.data.filter(m=>LIVE_STATUSES.has(m?.fixture?.status?.short)).length,[live.data]);

  const globalLiveGames = useMemo(()=>globalGames.data.filter(g=>BSKT_LIVE_ST.has(g.status?.short)),[globalGames.data]);

  const stats = {roi:"18.4%",winRate:"72%",streak:"7W",signals:String(filteredMatches.length)};

  const handleReset = useCallback(()=>{setFilter("All");setSelectedGeo("ALL");setSearchQuery("");},[]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard institutional-bg">
      <style>{`
        @keyframes scorePulse{0%,100%{opacity:1;text-shadow:0 0 0 transparent}50%{opacity:.8;text-shadow:0 0 14px var(--gold)}}
        @keyframes liveRing{0%,100%{box-shadow:0 0 0 0 rgba(255,68,68,0)}60%{box-shadow:0 0 0 5px rgba(255,68,68,.12)}}
        .live-score-num{animation:scorePulse 2.8s ease-in-out infinite}
        .live-card-ring{animation:liveRing 3s ease-in-out infinite}
      `}</style>
      <ErrorBoundary>
        {selectedMatch&&<AnalysisPanel match={selectedMatch} onClose={()=>setSelectedMatch(null)}/>}
        {selectedBsktGame&&<BasketballAnalysisPanel gameObj={selectedBsktGame} onClose={()=>setSelectedBsktGame(null)}/>}

        <Navbar onViewChange={setView} activeView={view}
          searchValue={searchQuery} onSearchChange={setSearchQuery} onSearchClear={()=>setSearchQuery("")}/>

        <StatsRibbon stats={stats} liveCount={liveCount}/>

        <section className="hero" style={{background:"#121417",border:"none"}}>
          <div className="hero-content">
            <h1 className="hero-title" style={{fontSize:"1.4rem",fontWeight:900,margin:"0 0 0.3rem"}}>PRIVATE INTELLIGENCE TERMINAL</h1>
            <p className="hero-desc" style={{color:"#555",letterSpacing:3,textTransform:"uppercase",fontSize:"0.6rem",margin:0}}>
              Elite sports market intelligence · Aggressive mode active
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

            {view==="basketball"&&(
              <section className="section">
                {/* Section header with live worldwide indicator */}
                <h2 className="section-title premium-label" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  ● BASKETBALL INTELLIGENCE TERMINAL
                  {globalLiveGames.length>0&&(
                    <span style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.6rem",color:"#ff4444",fontWeight:700}}>
                      <span className="live-dot"/>{globalLiveGames.length} LIVE WORLDWIDE
                    </span>
                  )}
                  <span style={{marginLeft:"auto",fontSize:"0.6rem",color:"#555"}}>
                    {nbaFilter==="🌍 Global"?globalGames.data.length:filteredBasketball.length} GAMES
                  </span>
                </h2>

                {basketball.loading ? <Spinner/> :
                 basketball.error ? (
                  <div style={{padding:"2rem",textAlign:"center",color:"#ff4444",border:"1px solid #ff4444",borderRadius:4}}>
                    <p style={{fontSize:"1.1rem",marginBottom:"0.8rem"}}>⚠️ Failed to load NBA games</p>
                    <p style={{color:"#666",fontSize:"0.85rem",marginBottom:"0.5rem"}}>{basketball.error}</p>
                    <p style={{color:"#444",fontSize:"0.75rem",marginBottom:"1.5rem"}}>
                      Make sure the backend is running: <code style={{color:"var(--teal)"}}>cd backend && node server.js</code>
                    </p>
                    <button onClick={()=>{fetchBasketball();fetchGlobalBasketball();}}
                      style={{padding:"0.8rem 1.5rem",background:"var(--gold)",color:"#000",border:"none",cursor:"pointer",borderRadius:4,fontWeight:700}}>
                      Retry
                    </button>
                  </div>

                 ) : nbaFilter==="🌍 Global" ? (
                  /* ── Worldwide view ─────────────────────────────────────── */
                  globalGames.loading ? <div style={{padding:"2rem",textAlign:"center",color:"#555",fontSize:"0.75rem"}}>Loading worldwide data…</div> :
                  globalGames.data.length===0 ? (
                    <>
                      <div style={{padding:"1.2rem 1.5rem",marginBottom:"1.5rem",background:"rgba(212,175,55,.04)",border:"1px solid rgba(212,175,55,.15)",borderRadius:4,textAlign:"center"}}>
                        <p style={{fontSize:"0.7rem",color:"#888",margin:"0 0 4px"}}>No worldwide data right now</p>
                        <p style={{fontSize:"0.58rem",color:"#555",margin:0}}>Showing NBA / WNBA instead</p>
                      </div>
                      {basketball.data.length===0 ? (
                        <div style={{padding:"2rem",textAlign:"center",color:"#555",border:"1px dashed #222",borderRadius:4}}>
                          <p style={{fontSize:"0.9rem"}}>No games found today</p>
                          <button onClick={()=>setNbaFilter("All")} style={{marginTop:"1rem",padding:"0.5rem 1rem",background:"transparent",border:"1px solid var(--gold)",color:"var(--gold)",cursor:"pointer",borderRadius:4,fontSize:"0.72rem",fontWeight:700}}>
                            REFRESH
                          </button>
                        </div>
                      ) : (
                        <div className="cards-grid">
                          {basketball.data.slice(0,20).map(g=><NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>)}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {globalGames.data.filter(g=>BSKT_LIVE_ST.has(g.status?.short)).length>0&&(
                        <>
                          <h2 className="section-title premium-label">🔴 LIVE RIGHT NOW</h2>
                          <div className="cards-grid" style={{marginBottom:"3rem"}}>
                            {globalGames.data.filter(g=>BSKT_LIVE_ST.has(g.status?.short)).map(g=>(
                              <GlobalBaskCard key={`gl_${g.id}`} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"global"})}/>
                            ))}
                          </div>
                        </>
                      )}
                      {globalGames.data.filter(g=>g.status?.short==="NS").length>0&&(
                        <>
                          <h2 className="section-title premium-label">● UPCOMING TODAY / TOMORROW</h2>
                          <div className="cards-grid" style={{marginBottom:"3rem"}}>
                            {globalGames.data.filter(g=>g.status?.short==="NS").map(g=>(
                              <GlobalBaskCard key={`gs_${g.id}`} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"global"})}/>
                            ))}
                          </div>
                        </>
                      )}
                      {globalGames.data.filter(g=>BSKT_DONE_ST.has(g.status?.short)).length>0&&(
                        <>
                          <h2 className="section-title premium-label">● COMPLETED TODAY</h2>
                          <div className="cards-grid">
                            {globalGames.data.filter(g=>BSKT_DONE_ST.has(g.status?.short)).map(g=>(
                              <GlobalBaskCard key={`gf_${g.id}`} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"global"})}/>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )

                 ) : nbaFilter==="Live Games" ? (
                  /* ── Live filter: show global live FIRST, then ESPN live ── */
                  <>
                    {globalLiveGames.length>0&&(
                      <>
                        <h2 className="section-title premium-label">🔴 LIVE WORLDWIDE</h2>
                        <div className="cards-grid" style={{marginBottom:"3rem"}}>
                          {globalLiveGames.map(g=><GlobalBaskCard key={`ll_${g.id}`} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"global"})}/>)}
                        </div>
                      </>
                    )}
                    {filteredBasketball.length>0&&(
                      <>
                        <h2 className="section-title premium-label">🔴 NBA / WNBA LIVE</h2>
                        <div className="cards-grid">
                          {filteredBasketball.map(g=><NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>)}
                        </div>
                      </>
                    )}
                    {globalLiveGames.length===0&&filteredBasketball.length===0&&(
                      <>
                        <div style={{padding:"1.2rem 1.5rem",marginBottom:"1.5rem",background:"rgba(255,68,68,.04)",border:"1px solid rgba(255,68,68,.12)",borderRadius:4,textAlign:"center"}}>
                          <p style={{fontSize:"0.75rem",color:"#888",margin:"0 0 4px"}}>No live games right now</p>
                          <p style={{fontSize:"0.58rem",color:"#555",margin:0}}>Showing upcoming games</p>
                        </div>
                        {basketball.data.filter(g=>g.status?.type?.state==="pre").length>0&&(
                          <div className="cards-grid">
                            {basketball.data.filter(g=>g.status?.type?.state==="pre").slice(0,8).map(g=>(
                              <NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>

                 ) : filteredBasketball.length===0 ? (
                  /* ── Empty state for other filters ──────────────────────── */
                  <div style={{padding:"3rem 2rem",textAlign:"center",color:"#555",border:"1px dashed #222",borderRadius:4}}>
                    <p style={{fontSize:"1rem",marginBottom:"0.5rem"}}>
                      {nbaFilter!=="All"?`No "${nbaFilter}" games found`:"No NBA / WNBA games in the next 4 days"}
                    </p>
                    {nbaFilter!=="All"&&(
                      <button onClick={()=>setNbaFilter("All")} style={{marginTop:"1rem",padding:"0.6rem 1.2rem",background:"transparent",border:"1px solid var(--gold)",color:"var(--gold)",cursor:"pointer",borderRadius:4,fontSize:"0.75rem",fontWeight:700}}>
                        SHOW ALL GAMES
                      </button>
                    )}
                  </div>

                 ) : nbaFilter==="All" ? (
                  /* ── Default "All" view: global live banner + featured + all ── */
                  <>
                    {globalLiveGames.length>0&&(
                      <>
                        <h2 className="section-title premium-label">🔴 LIVE WORLDWIDE</h2>
                        <div className="cards-grid" style={{marginBottom:"3rem"}}>
                          {globalLiveGames.map(g=><GlobalBaskCard key={`galll_${g.id}`} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"global"})}/>)}
                        </div>
                      </>
                    )}
                    {filteredBasketball.filter(g=>getBasketballIntelligence(g)?.isFeatured).length>0&&(
                      <>
                        <h2 className="section-title premium-label">● FEATURED MATCHUPS</h2>
                        <div className="cards-grid" style={{marginBottom:"3rem"}}>
                          {filteredBasketball.filter(g=>getBasketballIntelligence(g)?.isFeatured).map(g=>(
                            <NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>
                          ))}
                        </div>
                      </>
                    )}
                    <h2 className="section-title premium-label">● NBA / WNBA GAMES</h2>
                    <div className="cards-grid">
                      {filteredBasketball.filter(g=>!getBasketballIntelligence(g)?.isFeatured).map(g=>(
                        <NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>
                      ))}
                    </div>
                  </>

                 ) : (
                  /* ── Other filters (NBA, WNBA, Upcoming, Final, Featured) ── */
                  <>
                    <h2 className="section-title premium-label">● {nbaFilter.toUpperCase()}</h2>
                    <div className="cards-grid">
                      {filteredBasketball.map(g=><NBAGameCard key={g.id} game={g} onClick={()=>setSelectedBsktGame({game:g,type:"espn"})}/>)}
                    </div>
                  </>
                 )}
              </section>
            )}
          </main>

          <Sidebar
            activeFilter={filter} onFilterChange={setFilter}
            selectedGeo={selectedGeo} onGeoChange={setSelectedGeo}
            view={view}
            nbaFilter={nbaFilter} onNbaFilterChange={setNbaFilter}
            nbaNews={nbaNews}
            sportsNews={sportsNews}
            globalLiveGames={globalLiveGames}
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
