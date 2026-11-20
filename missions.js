// missions.js – exerciții și misiuni (date + stare).

export const EXERCISES = {
  pushup: { name: 'Flotări', unit: 'reps', tip: 'Pune telefonul pe podea, lateral față de tine. Corpul într-o linie dreaptă, tot corpul în cadru.' },
  squat: { name: 'Genuflexiuni', unit: 'reps', tip: 'Așază telefonul la nivelul taliei, lateral sau din față. Se vede corpul de la cap la glezne.' },
  situp: { name: 'Abdomene', unit: 'reps', tip: 'Întinde-te lateral față de cameră, cu genunchii îndoiți. Urcă până stai aproape drept.' },
  jack: { name: 'Jumping Jacks', unit: 'reps', tip: 'Stai cu fața la cameră, la 2–3 metri. Brațele sus și picioarele depărtate, apoi înapoi.' },
  plank: { name: 'Plank', unit: 'sec', tip: 'Lateral față de cameră, pe antebrațe. Corp drept; cronometrul merge doar cât ții poziția.' },
};

export const DIFFICULTIES = {
  beginner: { label: 'Începător', xp: 20, coins: 10 },
  medium: { label: 'Mediu', xp: 40, coins: 20 },
  advanced: { label: 'Avansat', xp: 70, coins: 35 },
};

const TARGETS = {
  beginner: { pushup: 5, squat: 10, situp: 10, plank: 15, jack: 10 },
  medium: { pushup: 10, squat: 20, situp: 20, plank: 30, jack: 20 },
  advanced: { pushup: 20, squat: 30, situp: 30, plank: 60, jack: 40 },
};

const ORDER = ['pushup', 'squat', 'situp', 'plank', 'jack'];

export const MISSIONS = [];
for (const d of Object.keys(DIFFICULTIES)) {
  for (const e of ORDER) {
    MISSIONS.push({
      id: `${e}-${d}`,
      exercise: e,
      difficulty: d,
      target: TARGETS[d][e],
      xp: DIFFICULTIES[d].xp,
      coins: DIFFICULTIES[d].coins,
    });
  }
}

export const getMission = (id) => MISSIONS.find((m) => m.id === id) || null;

export function targetLabel(m) {
  return EXERCISES[m.exercise].unit === 'sec' ? `${m.target} secunde` : `${m.target} repetări`;
}

/** Starea unei misiuni pentru ziua de azi. */
export function missionState(user, m, todayStr) {
  if (user.missionsDone[m.id] === todayStr) return { state: 'done', label: 'Finalizată azi', value: m.target };
  const p = user.missionProgress[m.id];
  if (p && p.date === todayStr && p.value > 0) return { state: 'progress', label: 'În progres', value: Math.min(p.value, m.target) };
  return { state: 'available', label: 'Disponibilă', value: 0 };
}
