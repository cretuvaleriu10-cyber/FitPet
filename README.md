# FITPET – instalare și pornire (Acode, Android)

## 1. Structura proiectului
```
FITPET/
  index.html      – structura ecranelor (login, navbar, antrenament)
  style.css       – tema albastru închis + cyan
  app.js          – navigare, ecrane, recompense, îngrijire, antrenament
  camera.js       – acces la cameră + erori clare
  ai-counter.js   – MediaPipe Pose + stări pe exercițiu + sesiune (Începe/Pauză/Oprește)
  missions.js     – exerciții și misiuni (15 misiuni)
  pets.js         – animale, stare (foame/energie/fericire), vizualizator Three.js
  auth.js         – login/register LOCAL (demo, nesecurizat) – pregătit pentru Firebase/Supabase
  storage.js      – LocalStorage (progres, istoric, inventar)
  assets/pets/    – AICI pui modelele GLB/GLTF
  assets/icons/   – icon.svg
  assets/sounds/  – (opțional, gol)
```

## 2. Modelele 3D (obligatoriu)
1. Copiază fișierele tale `.glb`/`.gltf` în `FITPET/assets/pets/`.
2. Deschide `pets.js` și la începutul fișierului potrivește căile cu numele REALE ale fișierelor:
   ```js
   dog:    { ..., file: 'assets/pets/dog.glb',    rotY: 0, scale: 1 },
   cat:    { ..., file: 'assets/pets/cat.glb',    rotY: 0, scale: 1 },
   rabbit: { ..., file: 'assets/pets/rabbit.glb', rotY: 0, scale: 1 },
   ```
3. Dacă un animal apare cu spatele, schimbă `rotY` (ex. `3.1416`). Dacă e prea mare/mic, schimbă `scale`.
   Aplicația normalizează automat dimensiunea, centrează animalul și îl pune cu labele pe platformă.
4. Dacă fișierul lipsește, vezi un mesaj clar în locul scenei 3D (nu un ecran gol).

## 3. Pornire în Acode
1. Instalează **Acode** (Play Store / F-Droid).
2. Copiază folderul `FITPET` pe telefon (ex. în `Documente/FITPET`) – dezarhivează zip-ul cu aplicația Fișiere.
3. În Acode: meniu ☰ → **Open folder** → alege `FITPET`.
4. Setează previzualizarea în browser: **Settings → Preview mode → Browser** (camera funcționează mai sigur în Chrome decât în previzualizarea internă).
5. Deschide `index.html` și apasă butonul ▶ (Run/Preview). Se deschide `http://localhost:8158/...` în Chrome.
6. La prima pornire permite **Camera** când browserul întreabă.

Camera cere context securizat: `localhost` sau `https` merg; `http://192.168...` NU merge.

Alternativă (Termux): `cd FITPET && python -m http.server 8080`, apoi deschide `http://localhost:8080` în Chrome.

## 4. Internet
Three.js, MediaPipe și modelul de poză se încarcă de pe CDN (unpkg, jsdelivr, storage.googleapis.com) la prima pornire – ai nevoie de internet. Procesarea camerei se face local; nimic din filmare nu e trimis pe server.

## 5. Cum te așezi pentru fiecare exercițiu
- Flotări / Plank: telefonul pe podea, lateral față de tine, tot corpul în cadru.
- Genuflexiuni: tot corpul de la cap la glezne în cadru (lateral sau din față).
- Abdomene: întins lateral față de cameră, genunchii îndoiți.
- Jumping Jacks: cu fața la cameră, 2–3 m distanță.
Dacă AI-ul nu te vede clar, apare „Repoziționează-te” și numărătoarea se oprește.

## 6. Autentificare
Este demonstrativă (LocalStorage, parola cu hash SHA-256 + salt) și NU este securizată. Pentru cont real, reimplementează funcțiile din `auth.js` (register, login, logout, currentEmail, updateName) cu Firebase Auth sau Supabase Auth; restul aplicației rămâne la fel.
