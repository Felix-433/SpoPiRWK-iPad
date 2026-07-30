import {
  computeDgSumme,
  computePraezisionSumme,
  computeDuellSumme,
  computeGesamt,
  computeMatchSummary,
  computeStandings,
} from './standings.js';

const STORAGE_KEY = 'spopirwk-db';
const EMPTY_DB = { clubs: [], shooters: [], matches: [], results: [] };

const DG_GROUPS = [
  'praezisionProbe',
  'praezisionDg1',
  'praezisionDg2',
  'praezisionDg3',
  'duellProbe',
  'duellDg1',
  'duellDg2',
  'duellDg3',
];

function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : structuredClone(EMPTY_DB);
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function enrichResult(r) {
  const dgSummen = {};
  for (const field of DG_GROUPS) {
    dgSummen[`${field}Summe`] = computeDgSumme(r[field]);
  }
  return {
    ...r,
    ...dgSummen,
    praezisionSumme: computePraezisionSumme(r),
    duellSumme: computeDuellSumme(r),
    gesamt: computeGesamt(r),
  };
}

function decorateMatch(match, db) {
  const summary = computeMatchSummary(match, db.results);
  const results = db.results.filter((r) => r.matchId === match.id).map(enrichResult);
  return { ...match, ...summary, results };
}

function readShots(body, field, allowed) {
  const raw = Array.isArray(body[field]) ? body[field] : [];
  const shots = [];
  for (let i = 0; i < 5; i += 1) {
    const v = raw[i];
    if (v === undefined || v === null || v === '') {
      shots.push(null);
      continue;
    }
    if (!allowed.includes(String(v))) return null;
    shots.push(String(v));
  }
  return shots;
}

// Mirrors the previous server's REST routes (path + method) so app.js's
// calling code didn't need to change, just the transport underneath it.
async function localApi(path, options = {}) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query || '');
  const segments = pathname.split('/').filter(Boolean); // ['clubs', ':id'?]
  const resource = segments[0];
  const id = segments[1];

  const db = loadDb();

  // --- Clubs ---
  if (resource === 'clubs' && method === 'GET' && !id) return db.clubs;
  if (resource === 'clubs' && method === 'POST' && !id) {
    if (!body.name) throw new Error('name ist erforderlich');
    const club = { id: crypto.randomUUID(), name: body.name, vereinsNr: body.vereinsNr ?? null };
    db.clubs.push(club);
    saveDb(db);
    return club;
  }
  if (resource === 'clubs' && method === 'DELETE' && id) {
    const idx = db.clubs.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Verein nicht gefunden');
    const inUse = db.matches.some((m) => m.heimClubId === id || m.gastClubId === id);
    if (inUse) throw new Error('Verein wird noch in Wettkämpfen verwendet');
    db.clubs.splice(idx, 1);
    db.shooters = db.shooters.filter((s) => s.clubId !== id);
    saveDb(db);
    return null;
  }

  // --- Shooters ---
  if (resource === 'shooters' && method === 'GET' && !id) {
    const clubId = params.get('clubId');
    return clubId ? db.shooters.filter((s) => s.clubId === clubId) : db.shooters;
  }
  if (resource === 'shooters' && method === 'POST' && !id) {
    if (!body.name || !body.clubId) throw new Error('name und clubId sind erforderlich');
    const shooter = { id: crypto.randomUUID(), clubId: body.clubId, passNr: body.passNr ?? null, name: body.name };
    db.shooters.push(shooter);
    saveDb(db);
    return shooter;
  }
  if (resource === 'shooters' && method === 'DELETE' && id) {
    const idx = db.shooters.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Schütze nicht gefunden');
    db.shooters.splice(idx, 1);
    db.results = db.results.filter((r) => r.schuetzeId !== id);
    saveDb(db);
    return null;
  }

  // --- Matches ---
  if (resource === 'matches' && method === 'GET' && !id) {
    return db.matches.map((m) => decorateMatch(m, db));
  }
  if (resource === 'matches' && method === 'POST' && !id) {
    if (!body.heimClubId || !body.gastClubId) {
      throw new Error('heimClubId und gastClubId sind erforderlich');
    }
    const match = {
      id: crypto.randomUUID(),
      datum: body.datum ?? null,
      heimClubId: body.heimClubId,
      gastClubId: body.gastClubId,
      bemerkung: body.bemerkung ?? '',
    };
    db.matches.push(match);
    saveDb(db);
    return decorateMatch(match, db);
  }
  if (resource === 'matches' && method === 'DELETE' && id) {
    const idx = db.matches.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Wettkampf nicht gefunden');
    db.matches.splice(idx, 1);
    db.results = db.results.filter((r) => r.matchId !== id);
    saveDb(db);
    return null;
  }

  // --- Results (upsert per matchId+schuetzeId) ---
  if (resource === 'results' && method === 'POST' && !id) {
    const { matchId, schuetzeId, seite } = body;
    if (!matchId || !schuetzeId || !seite) {
      throw new Error('matchId, schuetzeId und seite sind erforderlich');
    }
    if (seite !== 'heim' && seite !== 'gast') {
      throw new Error("seite muss 'heim' oder 'gast' sein");
    }
    const praezisionValues = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'Treffer', 'Fehler'];
    const duellValues = ['10', '9', '8', '7', '6', 'Treffer', 'Fehler'];
    const values = {};

    for (const field of ['praezisionProbe', 'praezisionDg1', 'praezisionDg2', 'praezisionDg3']) {
      const shots = readShots(body, field, praezisionValues);
      if (!shots) throw new Error(`${field}: jeder Schuss muss 10-1, Treffer oder Fehler sein`);
      values[field] = shots;
    }
    for (const field of ['duellProbe', 'duellDg1', 'duellDg2', 'duellDg3']) {
      const shots = readShots(body, field, duellValues);
      if (!shots) throw new Error(`${field}: jeder Schuss muss 10-6, Treffer oder Fehler sein`);
      values[field] = shots;
    }
    for (const field of ['praezisionStand', 'duellStand']) {
      const raw = body[field];
      if (raw === undefined || raw === null || raw === '') {
        values[field] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 1 || v > 10) {
        throw new Error(`${field} muss eine ganze Zahl von 1 bis 10 sein`);
      }
      values[field] = v;
    }

    let result = db.results.find((r) => r.matchId === matchId && r.schuetzeId === schuetzeId);
    if (result) {
      Object.assign(result, values, { seite });
    } else {
      result = { id: crypto.randomUUID(), matchId, schuetzeId, seite, ...values };
      db.results.push(result);
    }
    saveDb(db);
    return enrichResult(result);
  }
  if (resource === 'results' && method === 'DELETE' && id) {
    const idx = db.results.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Ergebnis nicht gefunden');
    db.results.splice(idx, 1);
    saveDb(db);
    return null;
  }

  // --- Standings ---
  if (resource === 'standings' && method === 'GET') {
    return computeStandings(db);
  }

  throw new Error('Unbekannte Route');
}

export { localApi };
