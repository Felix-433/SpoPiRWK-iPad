import { localApi } from './localApi.js';

const state = {
  clubs: [],
  shooters: [],
  matches: [],
  activeMatchId: null,
};

async function api(path, options = {}) {
  return localApi(path, options);
}

function clubName(clubId) {
  const club = state.clubs.find((c) => c.id === clubId);
  return club ? club.name : '(unbekannt)';
}

function shooterName(shooterId) {
  const shooter = state.shooters.find((s) => s.id === shooterId);
  return shooter ? shooter.name : '(unbekannt)';
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'tabelle') loadStandings();
      closeMatchDetail();
      if (btn.dataset.tab === 'wettkaempfe') {
        document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.toggle('active', b.dataset.subtab === 'liste'));
        document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.toggle('active', p.id === 'subtab-liste'));
        loadMatches();
      }
    });
  });

  document.querySelectorAll('.subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add('active');
      closeMatchDetail();
    });
  });
}

// ---------- Clubs ----------
async function loadClubs() {
  state.clubs = await api('/clubs');
  renderClubList();
  fillClubSelects();
}

function renderClubList() {
  const ul = document.getElementById('club-list');
  ul.innerHTML = '';
  for (const club of state.clubs) {
    const li = document.createElement('li');
    const count = state.shooters.filter((s) => s.clubId === club.id).length;
    li.innerHTML = `
      <span>${escapeHtml(club.name)} <span class="meta">${club.vereinsNr ? `#${club.vereinsNr} · ` : ''}${count} Schützen</span></span>
      <span class="actions"><button data-action="delete-club" data-id="${club.id}">Löschen</button></span>
    `;
    ul.appendChild(li);
  }
}

function fillClubSelects() {
  const options = state.clubs
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  for (const id of ['shooter-club', 'match-heim', 'match-gast']) {
    const select = document.getElementById(id);
    const prev = select.value;
    select.innerHTML = options;
    if (prev) select.value = prev;
  }
}

// ---------- Shooters ----------
async function loadShooters() {
  state.shooters = await api('/shooters');
  renderShooterGroups();
  renderClubList();
}

function renderShooterGroups() {
  const container = document.getElementById('shooter-groups');
  container.innerHTML = '';
  const clubId = document.getElementById('shooter-club').value;
  const club = state.clubs.find((c) => c.id === clubId);
  if (!club) return;

  const shooters = state.shooters.filter((s) => s.clubId === club.id);
  const group = document.createElement('div');
  group.className = 'shooter-group';
  group.innerHTML = `<h3>${escapeHtml(club.name)}</h3>`;
  const ul = document.createElement('ul');
  ul.className = 'item-list';
  for (const shooter of shooters) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${escapeHtml(shooter.name)} ${shooter.passNr ? `<span class="meta">Pass-Nr. ${escapeHtml(shooter.passNr)}</span>` : ''}</span>
      <span class="actions"><button data-action="delete-shooter" data-id="${shooter.id}">Löschen</button></span>
    `;
    ul.appendChild(li);
  }
  group.appendChild(ul);
  container.appendChild(group);
}

// ---------- Matches ----------
async function loadMatches() {
  state.matches = await api('/matches');
  renderMatchList();
  if (state.activeMatchId) {
    const match = state.matches.find((m) => m.id === state.activeMatchId);
    if (match) renderMatchDetail(match);
    else closeMatchDetail();
  }
}

function renderMatchList() {
  const ul = document.getElementById('match-list');
  ul.innerHTML = '';
  const sorted = [...state.matches].sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
  for (const match of sorted) {
    const li = document.createElement('li');
    li.className = 'match-card';
    li.dataset.id = match.id;
    let badge = '<span class="badge pending">ausstehend</span>';
    if (match.gespielt) {
      badge = `<span class="badge win">${match.heimRinge} : ${match.gastRinge}</span>`;
    }
    li.innerHTML = `
      <span>${match.datum ? escapeHtml(match.datum) + ' · ' : ''}${escapeHtml(clubName(match.heimClubId))} – ${escapeHtml(clubName(match.gastClubId))}</span>
      <span>${badge}</span>
    `;
    ul.appendChild(li);
  }
}

function closeMatchDetail() {
  state.activeMatchId = null;
  document.getElementById('match-detail').classList.add('hidden');
  document.getElementById('match-list-card').classList.remove('hidden');
}

function availableShootersFor(match, seite) {
  const clubId = seite === 'heim' ? match.heimClubId : match.gastClubId;
  const usedIds = new Set(match.results.filter((r) => r.seite === seite).map((r) => r.schuetzeId));
  return state.shooters.filter((s) => s.clubId === clubId && !usedIds.has(s.id));
}

function shooterOptionsHtml(shooters) {
  return (
    '<option value="">Schütze wählen…</option>' +
    shooters.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
  );
}

const PRAEZISION_VALUES = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'Treffer', 'Fehler'];
const DUELL_VALUES = ['10', '9', '8', '7', '6', 'Treffer', 'Fehler'];
const STAND_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// Maps a result's DG field name to the class prefix used for its 5 shot <select> elements.
const DG_FIELD_BASE = {
  praezisionProbe: 'f-praezision-probe',
  praezisionDg1: 'f-praezision-dg1',
  praezisionDg2: 'f-praezision-dg2',
  praezisionDg3: 'f-praezision-dg3',
  duellProbe: 'f-duell-probe',
  duellDg1: 'f-duell-dg1',
  duellDg2: 'f-duell-dg2',
  duellDg3: 'f-duell-dg3',
};

function summeClassFor(baseClass) {
  return `${baseClass.replace('f-', '')}-summe`;
}

function shotSelectHtml(cls, options, current) {
  const currentStr = current === null || current === undefined ? '' : String(current);
  const opts = options
    .map((o) => `<option value="${o}" ${o === currentStr ? 'selected' : ''}>${o}</option>`)
    .join('');
  return `<select class="${cls}"><option value=""></option>${opts}</select>`;
}

function dgRowHtml(baseClass, label, options, shots, summe, muted) {
  const cells = [1, 2, 3, 4, 5]
    .map((i) => shotSelectHtml(`${baseClass}-${i}`, options, (shots || [])[i - 1]))
    .join('');
  return `
    <div class="score-row${muted ? ' muted-row' : ''}">
      <span class="dg-label">${label}</span>
      ${cells}
      <span class="${summeClassFor(baseClass)} dg-summe">${summe}</span>
    </div>`;
}

function scoreGroupHtml(kind, title, options, standCls, standValue, r) {
  const probeField = `${kind}Probe`;
  return `
    <div class="score-group">
      <div class="score-group-header">
        <h4>${title}</h4>
        <label class="stand-label">Stand ${shotSelectHtml(standCls, STAND_VALUES, standValue)}</label>
        <span class="group-summe" data-kind="${kind}">Σ ${r[`${kind}Summe`]}</span>
      </div>
      <div class="score-table">
        <div class="score-table-header">
          <span></span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>Σ</span>
        </div>
        ${dgRowHtml(DG_FIELD_BASE[probeField], 'Probe DG', options, r[probeField], r[`${probeField}Summe`], true)}
        ${dgRowHtml(DG_FIELD_BASE[`${kind}Dg1`], 'DG 1', options, r[`${kind}Dg1`], r[`${kind}Dg1Summe`], false)}
        ${dgRowHtml(DG_FIELD_BASE[`${kind}Dg2`], 'DG 2', options, r[`${kind}Dg2`], r[`${kind}Dg2Summe`], false)}
        ${dgRowHtml(DG_FIELD_BASE[`${kind}Dg3`], 'DG 3', options, r[`${kind}Dg3`], r[`${kind}Dg3Summe`], false)}
      </div>
    </div>`;
}

function renderMatchDetail(match) {
  state.activeMatchId = match.id;
  const container = document.getElementById('match-detail');
  container.classList.remove('hidden');
  document.getElementById('match-list-card').classList.add('hidden');

  const sortedResults = [...match.results].sort((a, b) => {
    if (a.seite !== b.seite) return a.seite === 'heim' ? -1 : 1;
    return shooterName(a.schuetzeId).localeCompare(shooterName(b.schuetzeId), 'de');
  });

  const entries = sortedResults
    .map(
      (r) => `
    <div class="result-entry" data-result-id="${r.id}">
      <div class="entry-header">
        <span class="entry-club">${escapeHtml(clubName(r.seite === 'heim' ? match.heimClubId : match.gastClubId))}</span>
        <span class="entry-shooter">${escapeHtml(shooterName(r.schuetzeId))}</span>
        <span class="entry-gesamt">Gesamt: <strong class="gesamt">${r.gesamt}</strong></span>
        <button data-action="delete-result" data-id="${r.id}" title="Entfernen">✕ Entfernen</button>
      </div>
      <div class="score-groups">
        ${scoreGroupHtml('praezision', 'Präzision', PRAEZISION_VALUES, 'f-praezision-stand', r.praezisionStand, r)}
        ${scoreGroupHtml('duell', 'Duell', DUELL_VALUES, 'f-duell-stand', r.duellStand, r)}
      </div>
    </div>`
    )
    .join('');

  const addRow = `
    <div class="add-shooter-form" data-match-id="${match.id}">
      <select class="new-club">
        <option value="heim">${escapeHtml(clubName(match.heimClubId))}</option>
        <option value="gast">${escapeHtml(clubName(match.gastClubId))}</option>
      </select>
      <select class="new-shooter">
        ${shooterOptionsHtml(availableShootersFor(match, 'heim'))}
      </select>
      <button data-action="add-result">Hinzufügen</button>
    </div>`;

  const resultLineInner = match.gespielt
    ? `<strong>${match.heimRinge} : ${match.gastRinge}</strong> &nbsp; Punkte: ${match.heimPunkte}:${match.gastPunkte}`
    : '<span class="meta">Noch keine Ergebnisse erfasst.</span>';

  container.innerHTML = `
    <button class="close-detail" data-action="close-detail">✕</button>
    <button class="small-btn" data-action="delete-match" data-id="${match.id}">Wettkampf löschen</button>
    <h2>${escapeHtml(clubName(match.heimClubId))} – ${escapeHtml(clubName(match.gastClubId))}</h2>
    <p id="match-result-line">${resultLineInner}</p>
    <div class="result-list">
      ${entries}
      ${addRow}
      <div class="side-summary">
        Mannschaftsringe ${escapeHtml(clubName(match.heimClubId))}:
        <span class="ringe" data-seite="heim">${match.heimRinge}</span>
      </div>
      <div class="side-summary">
        Mannschaftsringe ${escapeHtml(clubName(match.gastClubId))}:
        <span class="ringe" data-seite="gast">${match.gastRinge}</span>
      </div>
    </div>
  `;
}

// Every result already carries a server-computed .gesamt (from load or the last save), so
// re-deriving the match summary just sums that instead of re-implementing the scoring rules here.
function recomputeMatchSummary(match) {
  const heim = match.results.filter((r) => r.seite === 'heim');
  const gast = match.results.filter((r) => r.seite === 'gast');
  const heimRinge = heim.reduce((sum, r) => sum + r.gesamt, 0);
  const gastRinge = gast.reduce((sum, r) => sum + r.gesamt, 0);
  const gespielt = heim.length > 0 && gast.length > 0;

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

  match.heimRinge = heimRinge;
  match.gastRinge = gastRinge;
  match.gespielt = gespielt;
  match.heimPunkte = heimPunkte;
  match.gastPunkte = gastPunkte;
}

// Updates the open match-detail panel in place (side totals, result line, list badge)
// without rebuilding the DOM, so focus/tab order survives saves made while tabbing through fields.
function updateMatchDetailSummary(match) {
  recomputeMatchSummary(match);
  const container = document.getElementById('match-detail');
  if (container.classList.contains('hidden') || state.activeMatchId !== match.id) return;

  for (const seite of ['heim', 'gast']) {
    const results = match.results.filter((r) => r.seite === seite);
    const ringe = results.reduce((sum, r) => sum + r.gesamt, 0);
    const ringeEl = container.querySelector(`.ringe[data-seite="${seite}"]`);
    if (ringeEl) ringeEl.textContent = ringe;
  }

  const resultLineEl = container.querySelector('#match-result-line');
  if (resultLineEl) {
    resultLineEl.innerHTML = match.gespielt
      ? `<strong>${match.heimRinge} : ${match.gastRinge}</strong> &nbsp; Punkte: ${match.heimPunkte}:${match.gastPunkte}`
      : '<span class="meta">Noch keine Ergebnisse erfasst.</span>';
  }

  renderMatchList();
}

function shotsFromDom(entryEl, baseClass) {
  return [1, 2, 3, 4, 5].map((i) => entryEl.querySelector(`.${baseClass}-${i}`).value);
}

async function saveResultRow(entryEl, matchId, schuetzeId, seite) {
  const payload = { matchId, schuetzeId, seite };
  for (const [field, baseClass] of Object.entries(DG_FIELD_BASE)) {
    payload[field] = shotsFromDom(entryEl, baseClass);
  }
  payload.praezisionStand = entryEl.querySelector('.f-praezision-stand').value;
  payload.duellStand = entryEl.querySelector('.f-duell-stand').value;

  let updated;
  try {
    updated = await api('/results', { method: 'POST', body: JSON.stringify(payload) });
  } catch (err) {
    alert(err.message);
    return;
  }

  const match = state.matches.find((m) => m.id === matchId);
  if (!match) return;
  const existing = match.results.find((r) => r.id === updated.id);
  if (existing) Object.assign(existing, updated);
  else match.results.push(updated);

  for (const [field, baseClass] of Object.entries(DG_FIELD_BASE)) {
    const el = entryEl.querySelector(`.${summeClassFor(baseClass)}`);
    if (el) el.textContent = updated[`${field}Summe`];
  }
  const praezisionSummeEl = entryEl.querySelector('.group-summe[data-kind="praezision"]');
  const duellSummeEl = entryEl.querySelector('.group-summe[data-kind="duell"]');
  if (praezisionSummeEl) praezisionSummeEl.textContent = `Σ ${updated.praezisionSumme}`;
  if (duellSummeEl) duellSummeEl.textContent = `Σ ${updated.duellSumme}`;
  const gesamtEl = entryEl.querySelector('.gesamt');
  if (gesamtEl) gesamtEl.textContent = updated.gesamt;

  updateMatchDetailSummary(match);
}

// ---------- Standings ----------
async function loadStandings() {
  const standings = await api('/standings');
  const tbody = document.querySelector('#standings-table tbody');
  tbody.innerHTML = '';
  standings.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.spiele}</td>
      <td>${row.siege}</td>
      <td>${row.unentschieden}</td>
      <td>${row.niederlagen}</td>
      <td>${row.punkte}</td>
      <td>${row.ringe}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Forms ----------
function initForms() {
  document.getElementById('shooter-club').addEventListener('change', renderShooterGroups);

  document.getElementById('club-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('club-name').value.trim();
    const nr = document.getElementById('club-nr').value;
    if (!name) return;
    await api('/clubs', {
      method: 'POST',
      body: JSON.stringify({ name, vereinsNr: nr ? Number(nr) : null }),
    });
    document.getElementById('club-form').reset();
    await loadClubs();
  });

  document.getElementById('shooter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clubId = document.getElementById('shooter-club').value;
    const name = document.getElementById('shooter-name').value.trim();
    const passNr = document.getElementById('shooter-passnr').value.trim();
    if (!clubId || !name) return;
    await api('/shooters', {
      method: 'POST',
      body: JSON.stringify({ clubId, name, passNr: passNr || null }),
    });
    document.getElementById('shooter-name').value = '';
    document.getElementById('shooter-passnr').value = '';
    await loadShooters();
  });

  document.getElementById('match-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datum = document.getElementById('match-datum').value;
    const heimClubId = document.getElementById('match-heim').value;
    const gastClubId = document.getElementById('match-gast').value;
    if (!heimClubId || !gastClubId) return;
    if (heimClubId === gastClubId) {
      alert('Heim- und Gastverein müssen unterschiedlich sein.');
      return;
    }
    await api('/matches', {
      method: 'POST',
      body: JSON.stringify({ datum: datum || null, heimClubId, gastClubId }),
    });
    document.getElementById('match-form').reset();
    await loadMatches();
  });
}

function initDelegatedEvents() {
  document.body.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) {
      const matchLi = e.target.closest('.match-card');
      if (matchLi) {
        const match = state.matches.find((m) => m.id === matchLi.dataset.id);
        if (match) renderMatchDetail(match);
      }
      return;
    }

    const action = target.dataset.action;
    if (action === 'delete-club') {
      if (!confirm('Verein wirklich löschen?')) return;
      try {
        await api(`/clubs/${target.dataset.id}`, { method: 'DELETE' });
        await loadClubs();
        await loadShooters();
      } catch (err) {
        alert(err.message);
      }
    } else if (action === 'delete-shooter') {
      if (!confirm('Schütze wirklich löschen?')) return;
      await api(`/shooters/${target.dataset.id}`, { method: 'DELETE' });
      await loadShooters();
      await loadMatches();
    } else if (action === 'close-detail') {
      closeMatchDetail();
    } else if (action === 'delete-match') {
      if (!confirm('Wettkampf wirklich löschen?')) return;
      await api(`/matches/${target.dataset.id}`, { method: 'DELETE' });
      closeMatchDetail();
      await loadMatches();
    } else if (action === 'add-result') {
      const row = target.closest('.add-shooter-form');
      const seite = row.querySelector('.new-club').value;
      const schuetzeId = row.querySelector('.new-shooter').value;
      if (!schuetzeId) return;
      await api('/results', {
        method: 'POST',
        body: JSON.stringify({ matchId: row.dataset.matchId, schuetzeId, seite }),
      });
      await loadMatches();
    } else if (action === 'delete-result') {
      await api(`/results/${target.dataset.id}`, { method: 'DELETE' });
      await loadMatches();
    }
  });

  document.body.addEventListener('change', (e) => {
    if (e.target.matches('.new-club')) {
      const row = e.target.closest('.add-shooter-form');
      const match = state.matches.find((m) => m.id === row.dataset.matchId);
      if (!match) return;
      const shooterSelect = row.querySelector('.new-shooter');
      shooterSelect.innerHTML = shooterOptionsHtml(availableShootersFor(match, e.target.value));
      return;
    }

    if (e.target.matches('.result-entry[data-result-id] select')) {
      const entry = e.target.closest('.result-entry');
      const match = state.matches.find((m) => m.id === state.activeMatchId);
      if (!match) return;
      const result = match.results.find((r) => r.id === entry.dataset.resultId);
      if (!result) return;
      saveResultRow(entry, match.id, result.schuetzeId, result.seite);
    }
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

async function init() {
  initTabs();
  initForms();
  initDelegatedEvents();
  await loadClubs();
  await loadShooters();
  await loadMatches();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

init();
