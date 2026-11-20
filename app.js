// app.js – orchestrarea interfeței: navigare, ecrane, recompense, îngrijire, antrenament.

import * as store from './storage.js';
import * as auth from './auth.js';
import { EXERCISES, DIFFICULTIES, MISSIONS, getMission, missionState, targetLabel } from './missions.js';
import { PETS, FOODS, TOYS, ensurePet, tickPet, moodOf, clampStat, PetViewer, newPet, stageOf, petScale, GROWTH_MAX } from './pets.js';
import { WorkoutSession } from './ai-counter.js';

/* ---------- utilitare ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
const valLabel = (ex, n) => (EXERCISES[ex].unit === 'sec' ? `${n} sec` : `${n} rep.`);

const EX_ICON = {
  pushup: '<svg viewBox="0 0 24 24"><circle cx="5" cy="9" r="2"/><path d="M7 11l13 4M9 12v6M20 15v3"/></svg>',
  squat: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l-4 3 2 5M12 12l4 3-2 5M5 9h4"/></svg>',
  situp: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="2"/><path d="M10 8l3 6h5l2 5M13 14l-5 6"/></svg>',
  jack: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M12 6v8M12 8L5 3M12 8l7-5M12 14l-5 7M12 14l5 7"/></svg>',
  plank: '<svg viewBox="0 0 24 24"><circle cx="4" cy="10" r="2"/><path d="M6 12l15 3M7 13v5h4M21 15v3"/></svg>',
};
const FX_SVG = {
  heart: '<svg viewBox="0 0 24 24" fill="#ff5b9a"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="#22e5ff"><path d="M12 2l2.6 6.4L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.6z"/></svg>',
};

let toastTimer = 0;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
}

/* beep scurt la fiecare repetare (WebAudio, fără fișiere) */
let actx = null;
function beep(freq = 880, dur = 0.09) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.15, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* sunetul e opțional */ }
}

/* ---------- modal ---------- */
function showModal(html, center = false) {
  $('#modal-card').innerHTML = html;
  $('#modal').classList.toggle('center', center);
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  if (adoptOpen) return; // alegerea animalului nu poate fi sărită
  $('#modal').classList.add('hidden');
  sheetKind = null;
}
let sheetKind = null;

/* ---------- scena 3D ---------- */
let viewer = null, viewerBusy = false;
const stage = document.createElement('div');
stage.className = 'pet-stage';
stage.innerHTML = '<div class="stage-status"></div>';

function stageStatus(type, msg) {
  const el = $('.stage-status', stage);
  if (type === 'ok') { el.className = 'stage-status'; el.innerHTML = ''; return; }
  el.className = 'stage-status show';
  el.innerHTML = type === 'loading'
    ? `<div class="spinner"></div><p>${esc(msg)}</p>`
    : `<div class="warn-ic">!</div><p>${esc(msg)}</p><button class="btn sm" data-act="retry-stage">Reîncearcă</button>`;
}

async function initViewer() {
  if (viewer || viewerBusy) return;
  viewerBusy = true;
  stageStatus('loading', 'Se pregătește scena 3D…');
  try {
    const v = new PetViewer(stage, stageStatus);
    await v.init();
    viewer = v;
    loadCurrentPet();
    syncStage();
  } catch (e) {
    console.error('[3D]', e);
    stageStatus('error', 'Nu am putut porni motorul 3D. Verifică internetul (Three.js se încarcă de pe CDN) și dacă telefonul suportă WebGL.');
  } finally {
    viewerBusy = false;
  }
}
function loadCurrentPet() {
  const u = store.getData();
  if (viewer && u && u.pet && !u.pet.dead) viewer.loadPet(u.pet.id, petScale(u.pet));
}

let tab = 'home', workoutOpen = false;
/** Mută scena în ecranul curent (Acasă / Îngrijire) și pornește/oprește randarea. */
function syncStage() {
  const holder = tab === 'home' ? $('#home-stage') : tab === 'care' ? $('#care-stage') : null;
  if (holder && stage.parentNode !== holder) holder.appendChild(stage);
  const on = !!holder && !workoutOpen && !document.hidden && !$('#app').classList.contains('hidden');
  if (viewer) viewer.setActive(on);
}
document.addEventListener('visibilitychange', syncStage);

function stageFx(kind) {
  const holder = stage.parentNode;
  if (!holder) return;
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'fx';
    s.innerHTML = FX_SVG[kind];
    s.style.left = 35 + Math.random() * 30 + '%';
    s.style.top = 45 + Math.random() * 15 + '%';
    s.style.animationDelay = i * 0.18 + 's';
    holder.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  }
}

/* ---------- navigare ---------- */
function go(name) {
  tab = name;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#main').scrollTop = 0;
  renderAll();
  syncStage();
}

function renderAll() {
  renderTop();
  if (tab === 'home') renderHome();
  else if (tab === 'missions') renderMissions();
  else if (tab === 'start') renderStart();
  else if (tab === 'care') renderCare();
  else if (tab === 'profile') renderProfile();
}

function renderTop() {
  const u = store.getData();
  if (!u) return;
  $('#top-level').textContent = 'Nv. ' + store.levelOf(u.xp);
  $('#top-coins').textContent = u.coins;
}

/* ---------- Acasă ---------- */
function petHead(u) {
  const p = u.pet;
  if (!p) return '<div class="pet-head"><h2>Niciun animal</h2></div>';
  const cfg = PETS[p.id];
  tickPet(p);
  const danger = !p.dead && (p.health < 50 || p.hunger > 85 || p.energy < 15);
  const why = p.hunger > 85 ? 'Îi e foame – hrănește-l.' : p.energy < 15 ? 'E epuizat – lasă-l să se odihnească.' : 'Are nevoie de grijă.';
  const warn = danger ? `<div class="warn-banner">⚠ ${esc(cfg.name)} e în pericol! ${why} Dacă sănătatea ajunge la 0, moare și pierzi seria de zile.</div>` : '';
  return `<div class="pet-head"><div class="row between"><h2>${esc(cfg.name)} <small class="muted" style="font-weight:500;font-size:14px">· ${esc(cfg.species)} · ${stageOf(p)}</small></h2><span class="mood">${moodOf(p)}</span></div>${warn}</div>`;
}

function renderHome() {
  const u = store.getData();
  const st = ensurePet(u, u.petId);
  const lvl = store.levelOf(u.xp), into = u.xp % store.XP_PER_LEVEL;
  const bondLvl = Math.floor(st.bond / 100) + 1, bondInto = st.bond % 100;
  const t = store.today();
  const done = MISSIONS.filter((m) => u.missionsDone[m.id] === t).length;
  $('#home-head').innerHTML = petHead(u, true);
  $('#home-body').innerHTML = `
    <div class="card lvl">
      <div class="lvl-ring" data-l="${lvl}" style="--p:${into}%"></div>
      <div style="flex:1">
        <div class="row between"><h3>Nivel ${lvl}</h3><span class="muted" style="font-size:13px">${u.xp} XP</span></div>
        ${bar(into)}
        <div class="muted" style="font-size:12.5px;margin-top:6px">${store.XP_PER_LEVEL - into} XP până la nivelul ${lvl + 1}</div>
      </div>
    </div>
    <div class="card">
      <div class="row between"><h3>Creștere · ${stageOf(st)}</h3><span class="muted" style="font-size:13px">${Math.round(st.growth || 0)}/${GROWTH_MAX}</span></div>
      <div style="margin-top:8px">${bar(((st.growth || 0) / GROWTH_MAX) * 100, 'green')}</div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">Crește doar dacă îl hrănești, te joci și îl mângâi.</div>
    </div>
    <div class="card">
      <div class="row between"><h3>Legătura cu ${esc(PETS[u.petId].name)}</h3><span class="muted" style="font-size:13px">Nivel ${bondLvl}</span></div>
      <div style="margin-top:8px">${bar(bondInto, 'green')}</div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">Crește cu fiecare antrenament terminat.</div>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${u.coins}</b><span>Monede</span></div>
      <div class="stat"><b>${store.effectiveStreak(u)}</b><span>Zile active la rând</span></div>
      <div class="stat"><b>${u.workoutCount}</b><span>Antrenamente</span></div>
      <div class="stat"><b>${u.totalReps}</b><span>Repetări totale</span></div>
    </div>
    <div class="card">
      <div class="row between"><h3>Misiuni azi</h3><span class="muted" style="font-size:13px">${done}/${MISSIONS.length}</span></div>
      <div style="margin:10px 0 12px">${bar((done / MISSIONS.length) * 100)}</div>
      <button class="btn primary block" data-act="goto" data-tab="missions">Vezi misiunile</button>
    </div>`;
}

/* ---------- Misiuni ---------- */
let missionFilter = 'all', selectedMission = null;

function renderMissions() {
  const u = store.getData(), t = store.today();
  const list = MISSIONS.filter((m) => missionFilter === 'all' || m.difficulty === missionFilter);
  const done = MISSIONS.filter((m) => u.missionsDone[m.id] === t).length;
  const chips = [['all', 'Toate'], ...Object.entries(DIFFICULTIES).map(([k, v]) => [k, v.label])]
    .map(([k, l]) => `<button class="chip ${missionFilter === k ? 'on' : ''}" data-act="filter" data-d="${k}">${l}</button>`).join('');
  $('#missions-body').innerHTML = `
    <div class="card"><div class="row between"><h2 style="margin:0">Misiuni</h2><span class="muted">${done}/${MISSIONS.length} azi</span></div>
      <div style="margin-top:10px">${bar((done / MISSIONS.length) * 100)}</div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">Recompensa se primește o dată pe zi pentru fiecare misiune finalizată.</p></div>
    <div class="filters">${chips}</div>
    ${list.map((m) => {
      const ex = EXERCISES[m.exercise], d = DIFFICULTIES[m.difficulty], s = missionState(u, m, t);
      const sel = selectedMission === m.id;
      return `<div class="mission ${sel ? 'sel' : ''}" data-act="mission-open" data-id="${m.id}">
        <div class="row">
          <div class="ico">${EX_ICON[m.exercise]}</div>
          <div style="flex:1;min-width:0"><h3>${ex.name}</h3><div class="meta">${targetLabel(m)}</div></div>
          <div style="text-align:right"><span class="tag ${m.difficulty}">${d.label}</span><div class="state ${s.state}" style="margin-top:6px">${s.label}</div></div>
        </div>
        <div class="row between" style="margin-top:10px"><div class="rewards"><span>+${m.xp} XP</span><span>+${m.coins} 🪙</span></div>
          <span class="muted" style="font-size:12.5px">${valLabel(m.exercise, s.value)} / ${m.target}</span></div>
        ${bar((s.value / m.target) * 100, s.state === 'done' ? 'green' : '')}
        ${sel ? `<div class="detail">${esc(ex.tip)}</div>` : ''}
        <button class="btn primary block" data-act="mission-start" data-id="${m.id}">${s.state === 'done' ? 'Repetă (fără recompensă)' : 'Începe misiunea'}</button>
      </div>`;
    }).join('')}`;
}

/* ---------- Start ---------- */
function renderStart() {
  const u = store.getData(), t = store.today();
  const next = MISSIONS.find((m) => u.missionsDone[m.id] !== t);
  const nextHtml = next
    ? `<div class="card quick"><p class="muted" style="font-size:13px">Misiune recomandată</p>
        <h2 style="margin:6px 0 2px">${EXERCISES[next.exercise].name}</h2>
        <p class="muted" style="margin-bottom:14px">${targetLabel(next)} · ${DIFFICULTIES[next.difficulty].label} · +${next.xp} XP</p>
        <button class="btn primary lg block" data-act="mission-start" data-id="${next.id}">Începe rapid</button></div>`
    : `<div class="card quick"><h2>Toate misiunile sunt făcute azi 🎉</h2><p class="muted" style="margin-top:6px">Poți face antrenamente libere mai jos.</p></div>`;
  $('#start-body').innerHTML = `${nextHtml}
    <div class="sec-title">Antrenament liber</div>
    <div class="ex-grid">${Object.entries(EXERCISES).map(([id, e]) =>
      `<button class="ex-btn" data-act="free-start" data-ex="${id}"><div class="ico">${EX_ICON[id]}</div>${e.name}<small>${e.unit === 'sec' ? 'cronometrat' : 'repetări automate'}</small></button>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin-top:14px;line-height:1.5">Antrenamentul liber oferă XP mic (1 XP la 2 repetări / 10 secunde de plank, max. 25). Misiunile oferă recompense complete.</p>`;
}

/* ---------- Îngrijire ---------- */
function renderCare() {
  const u = store.getData();
  const st = tickPet(ensurePet(u, u.petId));
  $('#care-head').innerHTML = petHead(u, true);
  const need = (label, v, cls) => `<div class="need"><div class="row between"><span>${label}</span><span class="muted">${Math.round(v)}%</span></div>${bar(v, cls)}</div>`;
  const foods = FOODS.map((f) => `${f.name} ×${u.inventory[f.id] || 0}`).join(' · ');
  const toys = TOYS.filter((x) => u.inventory[x.id]).map((x) => x.name).join(', ') || 'niciuna';
  $('#care-body').innerHTML = `
    <div class="card">
      ${need('Sănătate', st.health, st.health < 40 ? 'red' : 'green')}
      ${need('Foame', st.hunger, st.hunger > 70 ? 'red' : '')}
      ${need('Energie', st.energy)}
      ${need('Fericire', st.happiness, 'green')}
      ${need('Creștere · ' + stageOf(st), st.growth || 0)}
    </div>
    <div class="care-actions">
      <button class="btn" data-act="care-sheet" data-kind="food"><b>🍖</b>Hrănește</button>
      <button class="btn" data-act="care-sheet" data-kind="toy"><b>🎾</b>Joacă-te</button>
      <button class="btn" data-act="care-pet"><b>🤚</b>Mângâie</button>
    </div>
    <div class="card"><h3>Rucsac</h3>
      <p class="muted" style="font-size:13px;margin-top:6px;line-height:1.6">Mâncare: ${foods}<br>Jucării: ${toys}</p>
      <p class="muted" style="font-size:12.5px;margin-top:8px">Mâncarea și jucăriile se cumpără cu monedele câștigate la antrenamente.</p></div>`;
}

function sheetHTML(kind) {
  const u = store.getData(), lvl = store.levelOf(u.xp);
  const items = kind === 'food' ? FOODS : TOYS;
  const rows = items.map((it) => {
    const locked = lvl < it.minLevel;
    const owned = kind === 'food' ? u.inventory[it.id] || 0 : u.inventory[it.id] ? 1 : 0;
    const eff = kind === 'food'
      ? `Foame ${it.hunger} · Energie +${it.energy} · Fericire +${it.happy}`
      : `Energie ${it.energy} · Fericire +${it.happy}`;
    const buy = kind === 'toy' && owned ? '' : `<button class="btn sm" data-act="buy" data-id="${it.id}" ${locked || u.coins < it.price ? 'disabled' : ''}>${locked ? `Nv. ${it.minLevel}` : `${it.price} 🪙`}</button>`;
    const use = owned ? `<button class="btn sm primary" data-act="use" data-id="${it.id}">${kind === 'food' ? 'Dă' : 'Joacă'}</button>` : '';
    return `<div class="item"><div class="grow"><b>${it.name}</b>${kind === 'food' ? ` <span class="muted">×${owned}</span>` : owned ? ' <span class="state done">deținută</span>' : ''}<small>${eff}</small></div>${buy}${use}</div>`;
  }).join('');
  return `<div class="row between"><h2>${kind === 'food' ? 'Mâncare' : 'Jucării'}</h2><span class="chip coin">${u.coins}</span></div>${rows}
    <button class="btn ghost block" data-act="close-modal" style="margin-top:8px">Închide</button>`;
}
function openSheet(kind) { sheetKind = kind; showModal(sheetHTML(kind)); }

function buyItem(id) {
  const u = store.getData();
  const it = [...FOODS, ...TOYS].find((x) => x.id === id);
  if (!it) return;
  const isFood = FOODS.includes(it);
  if (store.levelOf(u.xp) < it.minLevel) return toast(`Se deblochează la nivelul ${it.minLevel}.`, true);
  if (u.coins < it.price) return toast('Nu ai destule monede. Termină un antrenament!', true);
  if (!isFood && u.inventory[id]) return toast('Ai deja această jucărie.');
  u.coins -= it.price;
  u.inventory[id] = isFood ? (u.inventory[id] || 0) + 1 : true;
  store.save();
  toast(`Ai cumpărat: ${it.name}`);
  renderTop(); renderCare();
  if (sheetKind) showModal(sheetHTML(sheetKind));
}

function useItem(id) {
  const u = store.getData();
  const st = tickPet(ensurePet(u, u.petId));
  const food = FOODS.find((x) => x.id === id), toy = TOYS.find((x) => x.id === id);
  if (food) {
    if (!u.inventory[id]) return toast('Nu mai ai această mâncare.', true);
    if (st.hunger < 8) return toast(`${PETS[u.petId].name} nu îi este foame acum.`);
    u.inventory[id]--;
    st.hunger = clampStat(st.hunger + food.hunger);
    st.energy = clampStat(st.energy + food.energy);
    st.happiness = clampStat(st.happiness + food.happy);
    grow(st, 5);
    viewer?.react('eat'); stageFx('star');
    toast(`${PETS[u.petId].name} a mâncat cu poftă!`);
  } else if (toy) {
    if (!u.inventory[id]) return toast('Cumpără mai întâi jucăria.', true);
    if (st.energy < 15) return toast(`${PETS[u.petId].name} este prea obosit. Lasă-l să se odihnească.`, true);
    if (st.hunger > 90) return toast(`${PETS[u.petId].name} este prea flămând ca să se joace.`, true);
    st.energy = clampStat(st.energy + toy.energy);
    st.happiness = clampStat(st.happiness + toy.happy);
    st.hunger = clampStat(st.hunger + 6);
    grow(st, 6);
    viewer?.react('play'); stageFx('star');
    toast(`${PETS[u.petId].name} s-a jucat cu ${toy.name.toLowerCase()}!`);
  }
  store.save();
  closeModal();
  renderCare();
}

function grow(st, amt) {
  const before = stageOf(st);
  if (st.health > 30) st.growth = Math.min(GROWTH_MAX, (st.growth || 0) + amt);
  viewer?.setGrowth(petScale(st));
  if (stageOf(st) !== before) toast(`${PETS[st.id].name} a crescut: ${stageOf(st)}! 🎉`);
}

function petPet() {
  const u = store.getData();
  const st = tickPet(ensurePet(u, u.petId));
  st.happiness = clampStat(st.happiness + 4);
  if (Date.now() - (st.lastPetGrow || 0) > 180000) { st.lastPetGrow = Date.now(); grow(st, 1); }
  store.save();
  viewer?.react('pet'); stageFx('heart');
  renderCare();
}

function setPet(id) {
  const u = store.getData();
  if (!PETS[id] || u.petId === id) return;
  u.petId = id;
  ensurePet(u, id);
  store.save();
  loadCurrentPet();
  renderAll();
}

/* ---------- Profil ---------- */
function eventsHTML(u) {
  const ev = (u.events || []).slice().reverse().slice(0, 20);
  if (!ev.length) return '<p class="muted" style="font-size:13px">Nimic încă.</p>';
  const when = (ts) => new Date(ts).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
  return ev.map((e) => {
    const nm = e.petId && PETS[e.petId] ? PETS[e.petId].name : '';
    let txt;
    if (e.type === 'death') txt = `💀 <b>${esc(nm)}</b> a murit (${esc(e.cause)}) după ${e.days} zile. Serie pierdută: <b>${e.lost}</b> zile.`;
    else if (e.type === 'streak_lost') txt = `🔥 Serie pierdută din ${esc(e.cause)}: <b>${e.lost}</b> zile.`;
    else txt = `🐾 L-ai adoptat pe <b>${esc(nm)}</b>.`;
    return `<div class="item"><div class="grow">${txt}<small>${when(e.ts)}</small></div></div>`;
  }).join('');
}

function renderProfile() {
  const u = store.getData(), acc = auth.currentAccount();
  const lvl = store.levelOf(u.xp);
  const hist = u.workouts.slice().reverse().slice(0, 15);
  $('#profile-body').innerHTML = `
    <div class="card row" style="gap:14px">
      <div class="lvl-ring" data-l="${esc((acc.name[0] || '?').toUpperCase())}" style="--p:${u.xp % 100}%"></div>
      <div><h2 style="margin:0">${esc(acc.name)}</h2><div class="muted" style="font-size:13px">${esc(acc.email)}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">Animal: <b style="color:var(--cyan)">${esc(PETS[u.petId].name)}</b> (${esc(PETS[u.petId].species)}) · ${stageOf(ensurePet(u))}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${lvl}</b><span>Nivel</span></div>
      <div class="stat"><b>${u.xp}</b><span>XP total</span></div>
      <div class="stat"><b>${u.coins}</b><span>Monede</span></div>
      <div class="stat"><b>${store.effectiveStreak(u)}</b><span>Serie zile active</span></div>
      <div class="stat"><b>${u.workoutCount}</b><span>Antrenamente</span></div>
      <div class="stat"><b>${u.totalReps}${u.totalSeconds ? ` <small style="font-size:13px">+${u.totalSeconds}s</small>` : ''}</b><span>Repetări totale</span></div>
    </div>
    <div class="card"><h3 style="margin-bottom:8px">Modifică numele</h3>
      <div class="row"><input id="prof-name" type="text" maxlength="30" value="${esc(acc.name)}" style="flex:1;min-width:0"><button class="btn primary" data-act="save-name">Salvează</button></div>
      <small class="err" id="prof-err"></small></div>
    <div class="card ev"><h3 style="margin-bottom:6px">Istoric animale și serii</h3>
      <p class="muted" style="font-size:12.5px;margin-bottom:6px">Record serie: ${u.bestStreak || 0} zile</p>${eventsHTML(u)}</div>
    <div class="card hist"><h3 style="margin-bottom:6px">Istoric misiuni și antrenamente</h3>
      ${hist.length ? hist.map((h) => `<div class="item"><div class="grow"><b>${esc(EXERCISES[h.exercise]?.name || h.exercise)}</b> <span class="muted">${h.mission ? '· misiune' : '· liber'}</span>
        <small>${new Date(h.ts).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })} · ${valLabel(h.exercise, h.value)}${h.target ? ' / ' + h.target : ''} · ${h.completed ? 'complet' : 'incomplet'}</small></div>
        <span class="state ${h.xp ? 'done' : 'available'}">${h.xp ? '+' + h.xp + ' XP' : '—'}</span></div>`).join('') : '<p class="muted" style="font-size:13px">Încă nu ai niciun antrenament. Pornește prima misiune!</p>'}</div>
    <button class="btn danger block lg" data-act="logout">Deconectare</button>
    <p class="demo-note" style="text-align:center">Cont demonstrativ salvat local pe acest telefon – nu este autentificare securizată pe server.</p>`;
}

/* ---------- recompense ---------- */
function applyResult(r) {
  const u = store.getData(), t = store.today();
  const ex = EXERCISES[r.exercise];
  const m = r.missionId ? getMission(r.missionId) : null;
  const lvBefore = store.levelOf(u.xp);
  let xp = 0, coins = 0, note = '';

  if (r.value > 0) {
    if (m) {
      if (r.completed) {
        if (u.missionsDone[m.id] !== t) { xp = m.xp; coins = m.coins; u.missionsDone[m.id] = t; }
        else note = 'Misiunea era deja finalizată azi – recompensa se primește o dată pe zi.';
      } else {
        const pr = u.missionProgress[m.id];
        if (!pr || pr.date !== t || pr.value < r.value) u.missionProgress[m.id] = { date: t, value: r.value };
        note = 'Misiune neterminată. Recompensa se primește când atingi ținta.';
      }
    } else {
      xp = Math.min(25, Math.floor(r.value / (ex.unit === 'sec' ? 10 : 2)));
      coins = Math.floor(xp / 2);
    }
    u.workoutCount++;
    if (ex.unit === 'sec') u.totalSeconds += r.value; else u.totalReps += r.value;
    if (u.lastActive !== t) { u.streak = u.lastActive === store.yesterday() ? u.streak + 1 : 1; u.lastActive = t; }
    u.bestStreak = Math.max(u.bestStreak || 0, u.streak);
    u.workouts.push({ ts: Date.now(), exercise: r.exercise, value: r.value, target: m ? m.target : null, mission: m ? m.id : null, completed: r.completed, xp, coins, duration: r.elapsed });
    if (u.workouts.length > 100) u.workouts.splice(0, u.workouts.length - 100);
    const ps = tickPet(ensurePet(u, u.petId));
    ps.bond += xp;
    ps.happiness = clampStat(ps.happiness + 10);
    ps.energy = clampStat(ps.energy - 5);
    ps.hunger = clampStat(ps.hunger + 5);
  }

  u.xp += xp;
  u.coins += coins;
  const lvAfter = store.levelOf(u.xp);
  const ups = [];
  let bonus = 0;
  for (let l = lvBefore + 1; l <= lvAfter; l++) { ups.push(l); bonus += 10 * l; }
  u.coins += bonus;
  const unlocked = [...FOODS, ...TOYS].filter((i) => i.minLevel > lvBefore && i.minLevel <= lvAfter).map((i) => i.name);
  store.save();
  return { xp, coins, bonus, ups, unlocked, note, streak: store.effectiveStreak(u) };
}

function showResult(r, a) {
  const ex = EXERCISES[r.exercise];
  const none = r.value <= 0;
  showModal(`<div class="res">
    <h2>${none ? 'Nicio repetare detectată' : r.completed ? 'Antrenament încheiat! 🎉' : 'Antrenament oprit'}</h2>
    <div class="big">${valLabel(r.exercise, r.value)}</div>
    <p>${esc(ex.name)} · timp ${fmtTime(r.elapsed)}${r.target ? ` · țintă ${r.target}` : ''}</p>
    ${none ? '<p>AI-ul nu a văzut nicio mișcare completă. Încearcă să te repoziționezi conform instrucțiunilor.</p>' : `
    <div class="gain"><span class="chip">+${a.xp} XP</span><span class="chip coin">+${a.coins}</span><span class="chip">🔥 Serie: ${a.streak}</span></div>`}
    ${a.ups.length ? `<p style="color:var(--cyan);font-weight:700">Nivel nou: ${a.ups[a.ups.length - 1]}! Bonus +${a.bonus} monede.</p>` : ''}
    ${a.unlocked.length ? `<p style="color:var(--ok)">Deblocat în magazin: ${a.unlocked.map(esc).join(', ')}</p>` : ''}
    ${a.note ? `<p>${esc(a.note)}</p>` : ''}
    <button class="btn primary lg block" data-act="close-modal" style="margin-top:12px">Continuă</button></div>`, true);
}

/* ---------- antrenament cu camera ---------- */
let session = null, wake = null, wCtx = null;

function setW(mode, msg = '') {
  $('#w-loading').classList.toggle('hidden', mode !== 'loading');
  $('#w-error').classList.toggle('hidden', mode !== 'error');
  if (mode === 'loading') $('#w-loading-text').textContent = msg;
  if (mode === 'error') $('#w-error-text').textContent = msg;
}

function setWState(s) {
  const run = s === 'running', pause = s === 'paused';
  $('#w-start').classList.toggle('hidden', !(s === 'ready'));
  $('#w-pause').classList.toggle('hidden', !(run || pause));
  $('#w-stop').classList.toggle('hidden', !(run || pause));
  $('#w-pause').textContent = pause ? 'Continuă' : 'Pauză';
  $('#w-flip').classList.toggle('hidden', s === 'countdown' || run || pause);
  if (s === 'ready') $('#w-hint').textContent = EXERCISES[wCtx.exercise].tip;
}

async function prepareWorkout() {
  setW('loading', 'Pornesc camera…');
  $('#w-start').classList.add('hidden');
  try {
    await session.prepare((m) => setW('loading', m));
    setW('none');
  } catch (e) {
    console.error('[workout]', e);
    setW('error', e.userMessage || 'Nu am putut porni antrenamentul: ' + (e.message || e));
  }
}

async function openWorkout({ exercise, missionId = null }) {
  if (workoutOpen) return;
  const m = missionId ? getMission(missionId) : null;
  const ex = EXERCISES[exercise];
  wCtx = { exercise, missionId };
  workoutOpen = true;
  syncStage(); // oprește randarea 3D cât timp rulează AI-ul
  $('#workout').classList.remove('hidden');
  $('#w-title').textContent = ex.name + (m ? ' · misiune' : '');
  $('#w-count-label').textContent = ex.unit === 'sec' ? 'Secunde ținute' : 'Repetări';
  $('#w-count').textContent = '0';
  $('#w-target').textContent = m ? '/ ' + m.target : '';
  $('#w-timer').textContent = '00:00';
  $('#w-hint').textContent = ex.tip;
  $('#w-hint').classList.remove('bad');
  $('#w-tracktext').textContent = 'Caut corpul…';
  $('.w-track').classList.remove('ok');
  try { wake = await navigator.wakeLock?.request('screen'); } catch (e) { wake = null; }

  session = new WorkoutSession({
    video: $('#cam-video'),
    overlay: $('#cam-overlay'),
    exercise,
    target: m ? m.target : null,
    onState: setWState,
    onCount: (v, added) => {
      const el = $('#w-count');
      el.textContent = v;
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      if (added) beep(880, 0.08);
    },
    onTick: (s) => ($('#w-timer').textContent = fmtTime(s)),
    onCountdown: (n) => {
      const c = $('#w-countdown');
      c.classList.toggle('hidden', n <= 0);
      c.textContent = n;
      if (n > 0) beep(520, 0.1);
    },
    onPose: (o) => {
      $('.w-track').classList.toggle('ok', o.tracked);
      $('#w-tracktext').textContent = o.tracked ? 'Corp detectat' : 'Corp nedetectat';
      if (session && session.state !== 'ready' || o.hint) {
        $('#w-hint').textContent = o.tracked ? o.hint : '⚠ ' + o.hint;
        $('#w-hint').classList.toggle('bad', !o.tracked);
      }
    },
    onDone: (r) => finishWorkout({ ...r, missionId }),
  });
  prepareWorkout();
}

async function closeWorkout() {
  if (session) { session.dispose(); session = null; }
  try { await wake?.release(); } catch (e) { /* ignorat */ }
  wake = null;
  $('#workout').classList.add('hidden');
  $('#w-countdown').classList.add('hidden');
  workoutOpen = false;
  syncStage();
}

async function finishWorkout(r) {
  beep(1040, 0.25);
  await closeWorkout();
  const a = applyResult(r);
  renderAll();
  showResult(r, a);
}

function requestCloseWorkout() {
  if (session && (session.state === 'running' || session.state === 'paused') && session.value > 0) {
    if (confirm('Oprești antrenamentul și salvezi ce ai făcut până acum?')) session.stop();
  } else {
    closeWorkout();
  }
}

/* ---------- moarte, adopție, serii ---------- */
let adoptOpen = false, regPet = 'dog';

function checkStreak(u) {
  if (u.streak > 0 && u.lastActive !== store.today() && u.lastActive !== store.yesterday()) {
    u.events.push({ ts: Date.now(), type: 'streak_lost', cause: 'inactivitate', lost: u.streak });
    u.streak = 0;
  }
}

function adoptButtons() {
  return `<div class="pet-select">${Object.values(PETS).map((p) =>
    `<button class="pet-opt" data-act="adopt" data-id="${p.id}">${esc(p.name)}<small>${esc(p.species)}</small></button>`).join('')}</div>`;
}

/** Verifică starea animalului: dacă a murit, înregistrează evenimentul, resetează seria și cere alegerea unui animal nou. */
function petWatch() {
  const u = store.getData();
  if (!u || workoutOpen || adoptOpen || $('#app').classList.contains('hidden')) return;
  checkStreak(u);
  if (!u.pet) { store.save(); return showAdopt(null); }
  tickPet(u.pet);
  if (u.pet.dead) {
    const p = u.pet;
    const lost = u.streak;
    if (!p.processed) {
      p.processed = true;
      u.events.push({ ts: p.diedAt, type: 'death', petId: p.id, cause: p.deathCause, days: Math.max(1, Math.round((p.diedAt - p.born) / 86400000)), lost });
      u.streak = 0;
    }
    store.save();
    renderAll();
    return showAdopt(p, lost);
  }
  store.save();
}

function showAdopt(dead, lost = 0) {
  adoptOpen = true;
  const head = dead
    ? `<h2>💀 ${esc(PETS[dead.id].name)} a murit</h2><p class="muted" style="margin:8px 0;line-height:1.5">Cauză: ${esc(dead.deathCause)}. ${lost ? `Ai pierdut seria de <b>${lost}</b> zile de antrenament – o găsești în Profil → Istoric.` : 'Nu aveai o serie activă.'} Ai grijă mai bine de noul prieten!</p>`
    : '<h2>Alege-ți animalul</h2><p class="muted" style="margin:8px 0">Începe ca pui și crește dacă ai grijă de el.</p>';
  showModal(head + adoptButtons(), true);
}

function adopt(id) {
  const u = store.getData();
  if (!PETS[id]) return;
  u.pet = newPet(id);
  u.petId = id;
  u.events.push({ ts: Date.now(), type: 'adopt', petId: id });
  store.save();
  adoptOpen = false;
  closeModal();
  loadCurrentPet();
  renderAll();
  toast(`L-ai adoptat pe ${PETS[id].name}!`);
}

function renderRegPets() {
  $('#reg-pets').innerHTML = Object.values(PETS).map((p) =>
    `<button type="button" class="pet-opt ${p.id === regPet ? 'on' : ''}" data-act="reg-pet" data-id="${p.id}">${esc(p.name)}<small>${esc(p.species)}</small></button>`).join('');
}

/* ---------- autentificare (UI) ---------- */
function showErrors(prefix, errors = {}) {
  $$(`[data-for^="${prefix}-"]`).forEach((el) => (el.textContent = errors[el.dataset.for.slice(prefix.length + 1)] || ''));
}
function authSwitch(to) {
  $('#form-login').classList.toggle('hidden', to !== 'login');
  $('#form-register').classList.toggle('hidden', to !== 'register');
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await auth.login($('#login-email').value, $('#login-pass').value);
  showErrors('login', r.errors);
  if (r.ok) enterApp();
});
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await auth.register({ name: $('#reg-name').value, email: $('#reg-email').value, pass: $('#reg-pass').value, pass2: $('#reg-pass2').value });
  showErrors('reg', r.errors);
  if (r.ok) {
    const u = store.getData();
    u.pet = newPet(regPet);
    u.petId = regPet;
    u.events.push({ ts: Date.now(), type: 'adopt', petId: regPet });
    store.save();
    enterApp();
  }
});

function showAuth() {
  closeModal();
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#login-pass').value = '';
  syncStage();
}

function enterApp() {
  const u = store.getData();
  if (!u) return showAuth();
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (u.pet) u.petId = u.pet.id;
  checkStreak(u);
  store.save();
  tab = 'home';
  go('home');
  if (viewer) loadCurrentPet(); else initViewer();
  petWatch();
}

/* ---------- evenimente (delegare) ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case 'goto': return go(el.dataset.tab);
    case 'auth-switch': return authSwitch(el.dataset.to);
    case 'reg-pet': regPet = el.dataset.id; return renderRegPets();
    case 'adopt': return adopt(el.dataset.id);
    case 'filter': missionFilter = el.dataset.d; return renderMissions();
    case 'mission-open':
      if (e.target.closest('button')) return;
      selectedMission = selectedMission === el.dataset.id ? null : el.dataset.id;
      return renderMissions();
    case 'mission-start': {
      const m = getMission(el.dataset.id);
      return m && openWorkout({ exercise: m.exercise, missionId: m.id });
    }
    case 'free-start': return openWorkout({ exercise: el.dataset.ex });
    case 'care-sheet': return openSheet(el.dataset.kind);
    case 'care-pet': return petPet();
    case 'buy': return buyItem(el.dataset.id);
    case 'use': return useItem(el.dataset.id);
    case 'close-modal': return closeModal();
    case 'retry-stage': return viewer ? loadCurrentPet() : initViewer();
    case 'save-name': {
      const r = auth.updateName($('#prof-name').value);
      if (!r.ok) { $('#prof-err').textContent = r.error; return; }
      toast('Nume actualizat'); return renderProfile();
    }
    case 'logout':
      if (confirm('Te deconectezi?')) { auth.logout(); showAuth(); }
      return;
  }
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

$('#w-close').addEventListener('click', requestCloseWorkout);
$('#w-error-close').addEventListener('click', closeWorkout);
$('#w-retry').addEventListener('click', prepareWorkout);
$('#w-start').addEventListener('click', () => { beep(440, 0.05); session?.start(); });
$('#w-pause').addEventListener('click', () => session?.togglePause());
$('#w-stop').addEventListener('click', () => session?.stop());
$('#w-flip').addEventListener('click', async () => {
  try { await session?.flipCamera(); } catch (e) { toast(e.userMessage || 'Nu pot schimba camera.', true); }
});

// actualizează periodic starea animalului (foame/energie) când ecranul de îngrijire e deschis
setInterval(() => {
  if (!$('#app').classList.contains('hidden') && !workoutOpen && $('#modal').classList.contains('hidden')) {
    petWatch();
    if (tab === 'care') renderCare(); else if (tab === 'home') renderHome();
  }
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) petWatch(); });
renderRegPets();

/* ---------- pornire ---------- */
function boot() {
  try {
    if (auth.currentEmail()) enterApp(); else showAuth();
  } catch (e) {
    console.error('[boot]', e);
    showAuth();
  }
  const b = $('#boot');
  b.classList.add('out');
  setTimeout(() => b.remove(), 400);
}
boot();
