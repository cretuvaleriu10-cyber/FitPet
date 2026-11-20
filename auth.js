// auth.js – autentificare DEMONSTRATIVĂ, locală.
//
// ⚠ NU este autentificare securizată: conturile și parolele (cu hash) sunt salvate
// doar în LocalStorage pe acest dispozitiv, fără server. Oricine are acces la
// telefon le poate citi sau șterge. Nu folosi parole reale.
//
// Pentru producție: păstrează aceleași funcții exportate (register, login, logout,
// currentEmail, updateName) și implementează-le cu Firebase Auth sau Supabase Auth.
// Restul aplicației nu trebuie schimbat.

import * as store from './storage.js';

export const AUTH_MODE = 'local'; // 'local' acum; 'firebase' | 'supabase' în viitor

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function hashPass(pass, salt) {
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* trecem la varianta simplă */ }
  let h = 5381; // fallback slab, doar pentru demo
  for (const c of salt + ':' + pass) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return 'weak' + h;
}

const randomSalt = () =>
  Array.from(crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(8)) : [Math.random() * 255], (b) =>
    Math.floor(b).toString(16).padStart(2, '0')
  ).join('');

export function validateRegister({ name, email, pass, pass2 }) {
  const e = {};
  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  if (name.length < 2) e.name = 'Numele trebuie să aibă cel puțin 2 caractere.';
  else if (name.length > 30) e.name = 'Numele este prea lung (max. 30).';
  if (!EMAIL_RE.test(email)) e.email = 'Introdu o adresă de email validă.';
  if (!pass || pass.length < 6) e.pass = 'Parola trebuie să aibă minimum 6 caractere.';
  if (pass2 !== pass) e.pass2 = 'Parolele nu coincid.';
  return e;
}

export async function register({ name, email, pass, pass2 }) {
  const errors = validateRegister({ name, email, pass, pass2 });
  email = (email || '').trim().toLowerCase();
  if (!errors.email && store.getAccount(email)) errors.email = 'Există deja un cont cu acest email.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const salt = randomSalt();
  store.createAccount({
    name: name.trim(),
    email,
    salt,
    hash: await hashPass(pass, salt),
    created: Date.now(),
    data: store.newData(),
  });
  store.setSession(email);
  return { ok: true };
}

export async function login(email, pass) {
  email = (email || '').trim().toLowerCase();
  const errors = {};
  if (!EMAIL_RE.test(email)) errors.email = 'Introdu o adresă de email validă.';
  if (!pass) errors.pass = 'Introdu parola.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const acc = store.getAccount(email);
  if (!acc || (await hashPass(pass, acc.salt)) !== acc.hash) {
    return { ok: false, errors: { form: 'Email sau parolă incorecte.' } };
  }
  store.setSession(email);
  return { ok: true };
}

export function logout() {
  store.setSession(null);
}

export const currentEmail = () => store.getSession();
export const currentAccount = () => store.getAccount();

export function updateName(name) {
  name = (name || '').trim();
  if (name.length < 2 || name.length > 30) return { ok: false, error: 'Numele trebuie să aibă între 2 și 30 de caractere.' };
  const acc = store.getAccount();
  if (!acc) return { ok: false, error: 'Nu ești autentificat.' };
  acc.name = name;
  store.save();
  return { ok: true };
}
