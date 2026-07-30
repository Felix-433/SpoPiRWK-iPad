// "Treffer"/"Fehler" aren't numeric (they're worth 0), so Number() + isFinite guards against them.
function toPoints(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Each DG (Durchgang) is 5 shots; its subtotal is the sum of those 5 values.
function computeDgSumme(shots) {
  return (shots || []).reduce((sum, v) => sum + toPoints(v), 0);
}

function computePraezisionSumme(result) {
  return (
    computeDgSumme(result.praezisionDg1) +
    computeDgSumme(result.praezisionDg2) +
    computeDgSumme(result.praezisionDg3)
  );
}

function computeDuellSumme(result) {
  return (
    computeDgSumme(result.duellDg1) + computeDgSumme(result.duellDg2) + computeDgSumme(result.duellDg3)
  );
}

function computeGesamt(result) {
  return computePraezisionSumme(result) + computeDuellSumme(result);
}

function computeMatchSummary(match, allResults) {
  const heimResults = allResults.filter((r) => r.matchId === match.id && r.seite === 'heim');
  const gastResults = allResults.filter((r) => r.matchId === match.id && r.seite === 'gast');
  const heimRinge = heimResults.reduce((sum, r) => sum + computeGesamt(r), 0);
  const gastRinge = gastResults.reduce((sum, r) => sum + computeGesamt(r), 0);
  const gespielt = heimResults.length > 0 && gastResults.length > 0;

  let heimPunkte = null;
  let gastPunkte = null;
  if (gespielt) {
    if (heimRinge > gastRinge) {
      heimPunkte = 2;
      gastPunkte = 0;
    } else if (heimRinge < gastRinge) {
      heimPunkte = 0;
      gastPunkte = 2;
    } else {
      heimPunkte = 1;
      gastPunkte = 1;
    }
  }

  return { heimRinge, gastRinge, heimPunkte, gastPunkte, gespielt };
}

function computeStandings(db) {
  const table = new Map();
  for (const club of db.clubs) {
    table.set(club.id, {
      clubId: club.id,
      name: club.name,
      spiele: 0,
      siege: 0,
      unentschieden: 0,
      niederlagen: 0,
      punkte: 0,
      ringe: 0,
    });
  }

  for (const match of db.matches) {
    const summary = computeMatchSummary(match, db.results);
    if (!summary.gespielt) continue;
    const heim = table.get(match.heimClubId);
    const gast = table.get(match.gastClubId);
    if (!heim || !gast) continue;

    heim.spiele += 1;
    gast.spiele += 1;
    heim.ringe += summary.heimRinge;
    gast.ringe += summary.gastRinge;
    heim.punkte += summary.heimPunkte;
    gast.punkte += summary.gastPunkte;

    if (summary.heimPunkte === 2) {
      heim.siege += 1;
      gast.niederlagen += 1;
    } else if (summary.gastPunkte === 2) {
      gast.siege += 1;
      heim.niederlagen += 1;
    } else {
      heim.unentschieden += 1;
      gast.unentschieden += 1;
    }
  }

  return [...table.values()].sort(
    (a, b) => b.punkte - a.punkte || b.ringe - a.ringe || a.name.localeCompare(b.name, 'de')
  );
}

export {
  computeDgSumme,
  computePraezisionSumme,
  computeDuellSumme,
  computeGesamt,
  computeMatchSummary,
  computeStandings,
};
