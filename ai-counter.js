// ai-counter.js – MediaPipe Pose Landmarker + numărarea repetărilor + sesiunea de antrenament.
// Totul rulează local pe telefon; imaginea camerei nu este trimisă nicăieri.
// MediaPipe și modelul .task se descarcă de pe CDN la prima pornire (e nevoie de internet).

import { CameraController } from './camera.js';

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class AIError extends Error {
  constructor(msg) { super(msg); this.userMessage = msg; }
}

/* ---------- motor MediaPipe (încărcat o singură dată, la cerere) ---------- */
let enginePromise = null;
function getEngine(onStatus) {
  if (!enginePromise) {
    enginePromise = (async () => {
      onStatus?.('Se încarcă modelul AI…');
      let mod;
      try { mod = await import(VISION_URL); }
      catch (e) { throw new AIError('Nu am putut încărca MediaPipe. Verifică conexiunea la internet (necesară la prima pornire).'); }
      let fileset;
      try { fileset = await mod.FilesetResolver.forVisionTasks(WASM_URL); }
      catch (e) { throw new AIError('Nu am putut încărca motorul AI (WASM). Verifică internetul.'); }
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try { return await mod.PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch (e) {
        try { return await mod.PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
        catch (e2) { throw new AIError('Nu am putut porni detectarea corpului pe acest telefon.'); }
      }
    })().catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

/* ---------- geometrie ---------- */
const IDX = { sh: 11, el: 13, wr: 15, hp: 23, kn: 25, an: 27 }; // stânga; dreapta = +1

function P(lm, i, w, h) {
  const p = lm[i];
  return { x: p.x * w, y: p.y * h, v: p.visibility ?? 1, nx: p.x, ny: p.y };
}
const seen = (p) => p.v >= 0.5 && p.nx > 0.01 && p.nx < 0.99 && p.ny > 0.01 && p.ny < 0.99;

export function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y, cbx = c.x - b.x, cby = c.y - b.y;
  const m = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!m) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / m))) * 180) / Math.PI;
}

/** Alege partea corpului (stânga/dreapta) în care TOATE punctele cerute sunt vizibile. */
function pickSide(lm, w, h, keysets) {
  for (const keys of keysets) {
    let best = null;
    for (const off of [0, 1]) {
      const s = {};
      let score = 1, all = true;
      for (const k of keys) {
        const p = P(lm, IDX[k] + off, w, h);
        s[k] = p;
        score = Math.min(score, p.v);
        if (!seen(p)) all = false;
      }
      if (all && (!best || score > best.score)) best = { s, score };
    }
    if (best) return best.s;
  }
  return null;
}

/* ---------- numărătoare pe bază de stări ---------- */
export class ExerciseCounter {
  constructor(id) {
    this.id = id;
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.seconds = 0;
    this.stage = null;
    this.angle = null;
    this.lastRep = 0;
    this.lastT = null;
  }

  _smooth(a) {
    if (a == null) return this.angle;
    this.angle = this.angle == null ? a : this.angle * 0.55 + a * 0.45;
    return this.angle;
  }

  _value() {
    return this.id === 'plank' ? Math.floor(this.seconds) : this.reps;
  }

  _lost(out, hint) {
    this.stage = null;
    this.angle = null;
    this.lastT = null;
    out.tracked = false;
    out.stage = null;
    out.hint = hint;
    out.value = this._value();
    return out;
  }

  _rep(now, counting, out) {
    if (counting && now - this.lastRep > 450) {
      this.reps++;
      this.lastRep = now;
      out.repAdded = true;
    }
  }

  /** lm = lista de 33 puncte MediaPipe (sau null). Nu numără dacă counting=false sau corpul nu e clar vizibil. */
  update(lm, w, h, now, counting) {
    const out = { tracked: false, hint: '', stage: this.stage, value: this._value(), repAdded: false };
    if (!lm) return this._lost(out, 'Nu detectez niciun corp. Intră în cadru.');
    const fn = this['_' + this.id];
    if (!fn) return this._lost(out, 'Exercițiu necunoscut.');
    fn.call(this, lm, w, h, now, counting, out);
    out.stage = this.stage;
    out.value = this._value();
    return out;
  }

  _pushup(lm, w, h, now, counting, out) {
    const s = pickSide(lm, w, h, [['sh', 'el', 'wr', 'hp', 'an'], ['sh', 'el', 'wr', 'hp', 'kn']]);
    if (!s) return this._lost(out, 'Nu te văd suficient de clar. Pune telefonul lateral, la podea, cu tot corpul în cadru.');
    out.tracked = true;
    const low = s.an || s.kn;
    if (Math.abs(s.sh.x - low.x) < Math.abs(s.sh.y - low.y) * 1.2) {
      this.stage = null;
      out.hint = 'Adoptă poziția de flotare, lateral față de cameră.';
      return;
    }
    const a = this._smooth(angle(s.sh, s.el, s.wr));
    if (a == null) return;
    if (a > 150) {
      if (this.stage === 'down') this._rep(now, counting, out);
      this.stage = 'up';
      out.hint = 'Coboară controlat';
    } else if (a < 100 && this.stage === 'up') {
      this.stage = 'down';
      out.hint = 'Împinge în sus';
    } else {
      out.hint = this.stage === 'down' ? 'Împinge în sus' : this.stage === 'up' ? 'Coboară controlat' : 'Întinde brațele complet pentru a începe';
    }
  }

  _squat(lm, w, h, now, counting, out) {
    const s = pickSide(lm, w, h, [['hp', 'kn', 'an']]);
    if (!s) return this._lost(out, 'Nu te văd de la șold la gleznă. Dă-te mai în spate, tot corpul în cadru.');
    out.tracked = true;
    const a = this._smooth(angle(s.hp, s.kn, s.an));
    if (a == null) return;
    if (a > 155) {
      if (this.stage === 'down') this._rep(now, counting, out);
      this.stage = 'up';
      out.hint = 'Coboară în genuflexiune';
    } else if (a < 115 && this.stage === 'up') {
      this.stage = 'down';
      out.hint = 'Ridică-te complet';
    } else {
      out.hint = this.stage === 'down' ? 'Ridică-te complet' : this.stage === 'up' ? 'Coboară în genuflexiune' : 'Stai drept pentru a începe';
    }
  }

  _situp(lm, w, h, now, counting, out) {
    const s = pickSide(lm, w, h, [['sh', 'hp', 'kn']]);
    if (!s) return this._lost(out, 'Întinde-te lateral față de cameră; umărul, șoldul și genunchiul trebuie să se vadă.');
    out.tracked = true;
    const a = this._smooth(angle(s.sh, s.hp, s.kn));
    if (a == null) return;
    if (a > 110) {
      if (this.stage === 'up') this._rep(now, counting, out);
      this.stage = 'down';
      out.hint = 'Ridică trunchiul';
    } else if (a < 85 && this.stage === 'down') {
      this.stage = 'up';
      out.hint = 'Revino jos controlat';
    } else {
      out.hint = this.stage === 'up' ? 'Revino jos controlat' : this.stage === 'down' ? 'Ridică trunchiul' : 'Întinde-te pe spate pentru a începe';
    }
  }

  _jack(lm, w, h, now, counting, out) {
    const L = (k) => P(lm, IDX[k], w, h);
    const R = (k) => P(lm, IDX[k] + 1, w, h);
    const pts = [L('sh'), R('sh'), L('wr'), R('wr'), L('an'), R('an')];
    if (!pts.every(seen)) return this._lost(out, 'Stai cu fața la cameră, de la cap la glezne în cadru.');
    out.tracked = true;
    const shW = Math.abs(L('sh').x - R('sh').x) || 1;
    const ankW = Math.abs(L('an').x - R('an').x);
    const up = L('wr').y < L('sh').y && R('wr').y < R('sh').y;
    const down = L('wr').y > L('sh').y && R('wr').y > R('sh').y;
    if (up && ankW > shW * 1.6) {
      this.stage = 'open';
      out.hint = 'Acum închide: brațe jos, picioare lipite';
    } else if (down && ankW < shW * 1.25) {
      if (this.stage === 'open') this._rep(now, counting, out);
      this.stage = 'closed';
      out.hint = 'Sari: brațe sus, picioare depărtate';
    } else {
      out.hint = this.stage === 'open' ? 'Acum închide: brațe jos, picioare lipite' : 'Sari: brațe sus, picioare depărtate';
    }
  }

  _plank(lm, w, h, now, counting, out) {
    const s = pickSide(lm, w, h, [['sh', 'hp', 'an'], ['sh', 'hp', 'kn']]);
    if (!s) return this._lost(out, 'Nu te văd suficient de clar. Lateral față de cameră, tot corpul în cadru.');
    out.tracked = true;
    const low = s.an || s.kn;
    const horizontal = Math.abs(s.sh.x - low.x) > Math.abs(s.sh.y - low.y) * 1.8;
    const a = angle(s.sh, s.hp, low);
    const holding = horizontal && a != null && a > 150;
    if (this.lastT != null && counting && holding) this.seconds += Math.min((now - this.lastT) / 1000, 0.5);
    this.lastT = now;
    this.stage = holding ? 'hold' : null;
    out.hint = holding ? 'Ține poziția!' : 'Corp drept, lateral față de cameră';
  }
}

/* ---------- schelet desenat pe video ---------- */
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

function drawPose(canvas, video, lm, color) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;
  const W = canvas.width, H = canvas.height;
  g.lineWidth = Math.max(3, W / 160);
  g.strokeStyle = color;
  g.fillStyle = '#ffffff';
  g.lineCap = 'round';
  for (const [a, b] of BONES) {
    if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
    g.beginPath();
    g.moveTo(lm[a].x * W, lm[a].y * H);
    g.lineTo(lm[b].x * W, lm[b].y * H);
    g.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if ((lm[i].visibility ?? 1) < 0.4) continue;
    g.beginPath();
    g.arc(lm[i].x * W, lm[i].y * H, Math.max(3, W / 150), 0, Math.PI * 2);
    g.fill();
  }
}

/* ---------- sesiunea de antrenament ---------- */
/**
 * Stări: idle → preparing → ready → countdown → running ⇄ paused → stopped (| disposed)
 * Callbacks: onState(state), onCount(value, repAdded), onTick(elapsedSec), onPose({tracked,hint,stage}),
 *            onCountdown(n), onDone({exercise,value,elapsed,target,completed})
 */
export class WorkoutSession {
  constructor(o) {
    this.video = o.video;
    this.overlay = o.overlay;
    this.exercise = o.exercise;
    this.target = o.target ?? null;
    this.cb = o;
    this.cam = new CameraController(this.video);
    this.counter = new ExerciseCounter(this.exercise);
    this.state = 'idle';
    this.elapsed = 0;
    this.value = 0;
    this._raf = 0;
    this._last = 0;
    this._lastVT = -1;
  }

  _set(s) {
    this.state = s;
    this.cb.onState?.(s);
  }

  async prepare(onStatus) {
    this._set('preparing');
    onStatus?.('Pornesc camera…');
    await this.cam.start();
    if (this.state === 'disposed') return;
    onStatus?.('Se încarcă modelul AI…');
    this.landmarker = await getEngine(onStatus);
    if (this.state === 'disposed') return;
    this._set('ready');
    if (!this._raf) this._raf = requestAnimationFrame(this._loop);
  }

  flipCamera() {
    return this.cam.flip();
  }

  start() {
    if (this.state !== 'ready') return;
    this.counter.reset();
    this.value = 0;
    this.elapsed = 0;
    this.cb.onCount?.(0, false);
    this.cb.onTick?.(0);
    let n = 3;
    this._set('countdown');
    this.cb.onCountdown?.(n);
    this._cd = setInterval(() => {
      n--;
      this.cb.onCountdown?.(Math.max(n, 0));
      if (n <= 0) { clearInterval(this._cd); this._run(); }
    }, 1000);
  }

  _run() {
    this._set('running');
    this._lastTick = performance.now();
    this._timer = setInterval(() => {
      const now = performance.now();
      if (this.state === 'running') {
        this.elapsed += (now - this._lastTick) / 1000;
        this.cb.onTick?.(this.elapsed);
      }
      this._lastTick = now;
    }, 250);
  }

  togglePause() {
    if (this.state === 'running') this._set('paused');
    else if (this.state === 'paused') { this.counter.lastT = null; this._set('running'); }
  }

  stop() {
    if (this.state === 'running' || this.state === 'paused') this._finish();
    else if (this.state === 'countdown') { clearInterval(this._cd); this.cb.onCountdown?.(0); this._set('ready'); }
  }

  _finish() {
    if (this.state === 'stopped') return;
    clearInterval(this._timer);
    this._set('stopped');
    const value = this.value;
    this.cb.onDone?.({
      exercise: this.exercise,
      value,
      elapsed: Math.round(this.elapsed),
      target: this.target,
      completed: this.target ? value >= this.target : value > 0,
    });
  }

  _loop = () => {
    if (this.state === 'disposed' || this.state === 'stopped') { this._raf = 0; return; }
    this._raf = requestAnimationFrame(this._loop);
    const v = this.video;
    if (!this.landmarker || v.readyState < 2 || !v.videoWidth) return;
    const now = performance.now();
    if (now - this._last < 60) return; // ~16 fps – ușor pentru telefoane slabe, UI rămâne fluid
    if (v.currentTime === this._lastVT) return;
    this._last = now;
    this._lastVT = v.currentTime;

    let lm = null;
    try {
      const res = this.landmarker.detectForVideo(v, now);
      lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
    } catch (e) {
      console.warn('[ai] detectare eșuată', e);
    }

    const counting = this.state === 'running';
    const out = this.counter.update(lm, v.videoWidth, v.videoHeight, now, counting);
    drawPose(this.overlay, v, lm, out.tracked ? '#22e5ff' : '#ff5b7a');
    if (out.value !== this.value) {
      this.value = out.value;
      this.cb.onCount?.(this.value, out.repAdded);
    }
    this.cb.onPose?.(out);
    if (counting && this.target && this.value >= this.target) this._finish();
  };

  dispose() {
    clearInterval(this._cd);
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.cam.stop();
    this.state = 'disposed';
  }
}
