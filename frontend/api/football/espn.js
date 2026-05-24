// Free ESPN soccer API — no key required. Used as automatic fallback when
// API-Sports quota is exhausted or subscription has expired.
// Returns data in API-Sports fixture format so the existing intelligence engine
// works unchanged.

const LEAGUES = [
  { slug: "eng.1",          id: 39,  name: "Premier League",      country: "England"     },
  { slug: "esp.1",          id: 140, name: "La Liga",              country: "Spain"       },
  { slug: "ger.1",          id: 78,  name: "Bundesliga",           country: "Germany"     },
  { slug: "ita.1",          id: 135, name: "Serie A",              country: "Italy"       },
  { slug: "fra.1",          id: 61,  name: "Ligue 1",              country: "France"      },
  { slug: "uefa.champions", id: 1,   name: "Champions League",     country: "Europe"      },
  { slug: "uefa.europa",    id: 2,   name: "Europa League",        country: "Europe"      },
  { slug: "uefa.conference",id: 3,   name: "Conference League",    country: "Europe"      },
  { slug: "ned.1",          id: 88,  name: "Eredivisie",           country: "Netherlands" },
  { slug: "por.1",          id: 94,  name: "Primeira Liga",        country: "Portugal"    },
  { slug: "eng.2",          id: 40,  name: "Championship",         country: "England"     },
  { slug: "tur.1",          id: 203, name: "Süper Lig",            country: "Turkey"      },
  { slug: "usa.1",          id: 253, name: "MLS",                  country: "USA"         },
  { slug: "bra.1",          id: 71,  name: "Brasileirao",          country: "Brazil"      },
  { slug: "mex.1",          id: 262, name: "Liga MX",              country: "Mexico"      },
  { slug: "sco.1",          id: 179, name: "Scottish Premiership", country: "Scotland"    },
  { slug: "arg.1",          id: 128, name: "Primera División",     country: "Argentina"   },
];

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const UA   = { "User-Agent": "Mozilla/5.0 (compatible; StealthSports/1.0)" };

function adaptEvent(event, league) {
  const comp  = event.competitions?.[0];
  const homeC = comp?.competitors?.find(c => c.homeAway === "home");
  const awayC = comp?.competitors?.find(c => c.homeAway === "away");
  const state = event.status?.type?.state;       // "pre" | "in" | "post"
  const period = event.status?.period || 1;
  const clock  = event.status?.displayClock || "0:00";
  const mins   = parseInt(clock) || 0;
  const desc   = (event.status?.type?.description || "").toLowerCase();

  let short = "NS", elapsed = 0;
  if (state === "in") {
    if (desc.includes("halftime") || desc.includes("half time")) {
      short = "HT"; elapsed = 45;
    } else if (desc.includes("extra time") || desc.includes("overtime")) {
      short = "ET"; elapsed = 90 + Math.min(30, mins);
    } else if (period === 1) {
      short = "1H"; elapsed = Math.min(45, mins);
    } else {
      short = "2H"; elapsed = 45 + Math.min(45, mins);
    }
  } else if (state === "post") {
    short = "FT"; elapsed = 90;
  }

  // ESPN uses string "0" for pre-match scores — only use scores for live/final
  const homeGoals = state !== "pre" ? (parseInt(homeC?.score) || 0) : null;
  const awayGoals = state !== "pre" ? (parseInt(awayC?.score) || 0) : null;

  // Create a numeric ID: ESPN IDs are numeric strings, use them directly
  const fixtureId = parseInt(event.id) || 0;

  return {
    fixture: {
      id: fixtureId,
      date: event.date,
      status: {
        short,
        elapsed,
        long: state === "pre" ? "Not Started" : state === "post" ? "Match Finished" : "In Progress",
      },
      venue: {
        name: comp?.venue?.fullName || "",
        city: comp?.venue?.address?.city || "",
      },
    },
    league: {
      id: league.id,
      name: league.name,
      country: league.country,
      logo: "",
      flag: "",
    },
    teams: {
      home: {
        id: parseInt(homeC?.team?.id) || 0,
        name: homeC?.team?.displayName || homeC?.team?.name || "Home",
        logo: homeC?.team?.logo || "",
      },
      away: {
        id: parseInt(awayC?.team?.id) || 0,
        name: awayC?.team?.displayName || awayC?.team?.name || "Away",
        logo: awayC?.team?.logo || "",
      },
    },
    goals: { home: homeGoals, away: awayGoals },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
    _source: "espn",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const settled = await Promise.allSettled(
    LEAGUES.map(async lg => {
      try {
        const r = await fetch(`${BASE}/${lg.slug}/scoreboard`, { headers: UA });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.events || []).map(e => adaptEvent(e, lg));
      } catch {
        return [];
      }
    })
  );

  const all = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);
  res.json({ response: all, results: all.length, _source: "espn" });
}
