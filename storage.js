// storage.js – persistență locală în LocalStorage (versiunea demonstrativă).
// Toate datele rămân pe acest telefon. Pentru cloud, înlocuiește funcțiile de aici
// cu apeluri către Firebase / Supabase (vezi și auth.js).

const KEY = 'fitpet.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.users) return parsed;
  } catch (e) {
    console.warn('[storage] citire eșuată', e);
  }
  return { users: {}, session: null };
}

let db = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    console.error('[storage] salvare eșuată', e);
    return false;
  }
}

/* ---------- date ---------- */
const pad = (n) => String(n).padStart(2, '0');
export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => dateStr();
export const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateStr(d);
};

/* ---------- progres ---------- */
export const XP_PER_LEVEL = 100;
export const levelOf = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;

export function newData() {
  return {
    petId: 'dog',
    xp: 0,
    coins: 30,            // bonus de bun venit
    streak: 0,
    lastActive: null,
    workoutCount: 0,
    totalReps: 0,
    totalSeconds: 0,
    workouts: [],         // istoric (ultimele 100)
    missionsDone: {},     // { missionId: 'YYYY-MM-DD' }
    missionProgress: {},  // { missionId: { date, value } }
    inventory: {},        // { itemId: cantitate | true }
    pets: {},             // (vechi) neutilizat
    pet: null,            // animalul curent: vezi newPet() în pets.js
    events: [],           // istoric: decese, serii pierdute, adopții
    bestStreak: 0,
  };
}

export function effectiveStreak(d) {
  if (!d) return 0;
  return d.lastActive === today() || d.lastActive === yesterday() ? d.streak : 0;
}

/* ---------- sesiune / conturi ---------- */
export function getSession() {
  return db.session && db.users[db.session] ? db.session : null;
}
export function setSession(email) {
  db.session = email;
  persist();
}
export function getAccount(email = db.session) {
  return email ? db.users[email] || null : null;
}
export function createAccount(acc) {
  db.users[acc.email] = acc;
  persist();
}

/** Datele utilizatorului curent (obiect viu – apelează save() după modificări). */
export function getData() {
  const acc = getAccount();
  if (!acc) return null;
  if (!acc.data) acc.data = newData();
  const def = newData();
  for (const k of Object.keys(def)) if (!(k in acc.data)) acc.data[k] = def[k];
  return acc.data;
}
export function save() {
  return persist();
}
