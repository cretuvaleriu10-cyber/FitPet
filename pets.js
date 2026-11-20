// pets.js – configurația animalelor, starea lor (foame/energie/fericire) și vizualizatorul 3D.
//
// ⚠ MODELELE 3D: pune fișierele tale GLB/GLTF în assets/pets/ și potrivește căile de mai jos
// cu numele REALE ale fișierelor. Dacă un fișier lipsește, aplicația arată un mesaj clar.
// Dacă un model apare întors sau prea mare/mic, ajustează `rotY` (radiani) și `scale`.

export const PETS = {
  // `clips` = (opțional) numele exact al animațiilor din model pentru: idle (repaus), happy, eat
  dog:    { id: 'dog',    name: 'Max',  species: 'Câine',  file: 'assets/pets/animated_dog_shiba_inu.glb',            rotY: 0, scale: 1,
            clips: { idle: '0|standing_0', happy: '0|shake_0' } },
  cat:    { id: 'cat',    name: 'Luna', species: 'Pisică', file: 'assets/pets/an_animated_cat.glb',                   rotY: 0, scale: 1,
            clips: { idle: 'Take 001' } },
  rabbit: { id: 'rabbit', name: 'Pufi', species: 'Iepure', file: 'assets/pets/rabbit_-_realistic_3d_model_demo_free.glb', rotY: 0, scale: 1,
            clips: { idle: 'Rabbit|Rabbit_Idle' } },
};

/* mâncare (consumabilă) și jucării (se cumpără o dată) – se plătesc cu monede */
export const FOODS = [
  { id: 'biscuit', name: 'Biscuit',        price: 8,  hunger: -20, energy: 2,  happy: 2,  minLevel: 1 },
  { id: 'meal',    name: 'Masă completă',  price: 20, hunger: -45, energy: 8,  happy: 4,  minLevel: 1 },
  { id: 'premium', name: 'Meniu premium',  price: 45, hunger: -80, energy: 15, happy: 10, minLevel: 3 },
];
export const TOYS = [
  { id: 'ball',    name: 'Minge',     price: 25, energy: -12, happy: 14, minLevel: 1 },
  { id: 'rope',    name: 'Frânghie',  price: 40, energy: -15, happy: 20, minLevel: 2 },
  { id: 'frisbee', name: 'Frisbee',   price: 60, energy: -20, happy: 28, minLevel: 4 },
];

/* ---------- starea animalului ---------- */
const clamp = (v) => Math.max(0, Math.min(100, v));
export const clampStat = clamp;

/* Reguli de supraviețuire (ajustează aici dacă vrei mai blând / mai strict) */
export const RULES = {
  hungerPerMin: 0.15,      // cât crește foamea pe minut
  starveAt: 95,            // foame >= asta => sănătatea scade
  exhaustedBelow: 10,      // energie < asta => sănătatea scade
  starveLossPerMin: 0.07,  // ~24 h de foame totală până la 0 sănătate
  exhaustLossPerMin: 0.05,
  healPerMin: 0.05,        // refacere când e bine hrănit și odihnit
};
export const GROWTH_MAX = 100;
export const stageOf = (p) => ((p.growth || 0) < 30 ? 'Pui' : (p.growth || 0) < 75 ? 'Tânăr' : 'Adult');
/** Mărimea animalului: pui = 45%, adult = 100% */
export const petScale = (p) => 0.45 + 0.55 * Math.min(1, (p.growth || 0) / GROWTH_MAX);

export function newPet(id) {
  const now = Date.now();
  return { id, born: now, growth: 0, hunger: 30, energy: 90, happiness: 70, health: 100, bond: 0, t: now, dead: false };
}

/** Returnează animalul utilizatorului (sau un animal temporar nesalvat dacă încă nu are unul). */
export function ensurePet(user) {
  return user.pet || newPet(user.petId || 'dog');
}

/** Simulează scurgerea timpului în pași de 10 minute; poate duce la moartea animalului. */
export function tickPet(p, now = Date.now()) {
  if (p.dead) { p.t = now; return p; }
  let min = Math.min(Math.max((now - p.t) / 60000, 0), 14 * 24 * 60);
  let t = p.t;
  while (min > 0) {
    const d = Math.min(10, min);
    min -= d;
    t += d * 60000;
    p.hunger = clamp(p.hunger + d * RULES.hungerPerMin);
    p.energy = clamp(p.hunger > 85 ? p.energy - d * 0.08 : p.energy + d * 0.1);
    p.happiness = clamp(p.happiness - d * (p.hunger > 70 ? 0.15 : 0.07));
    const starving = p.hunger >= RULES.starveAt;
    const exhausted = p.energy < RULES.exhaustedBelow;
    const loss = (starving ? RULES.starveLossPerMin : 0) + (exhausted ? RULES.exhaustLossPerMin : 0);
    if (loss > 0) p.health = clamp(p.health - d * loss);
    else if (p.hunger < 70 && p.energy >= 30) p.health = clamp(p.health + d * RULES.healPerMin);
    if (p.health <= 0) {
      p.dead = true;
      p.diedAt = t;
      p.deathCause = starving ? 'foame' : 'epuizare';
      p.t = t;
      return p;
    }
  }
  p.t = now;
  return p;
}

export function moodOf(p) {
  if (p.hunger > 75) return 'Flămând';
  if (p.energy < 20) return 'Obosit';
  if (p.happiness > 75) return 'Fericit';
  if (p.happiness < 30) return 'Trist';
  return 'Liniștit';
}

/* ---------- vizualizator 3D ---------- */
const TARGET_SIZE = 1.6; // dimensiunea maximă a oricărui animal -> proporții echilibrate

export class PetViewer {
  constructor(stageEl, onStatus = () => {}) {
    this.stage = stageEl;
    this.onStatus = onStatus;
    this.active = false;
    this.token = 0;
    this.model = null;
    this.mixer = null;
    this.clips = {};
    this.fx = null;
    this._raf = 0;
    this._t = 0;
    this.growScale = 1;
    this.curScale = 1;
  }

  setGrowth(v) {
    this.growScale = v;
  }

  async init() {
    // Three.js se încarcă doar când e nevoie (importmap din index.html)
    const T = (this.T = await import('three'));
    const [{ GLTFLoader }, { DRACOLoader }, { OrbitControls }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
    ]);

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      throw new Error('WebGL indisponibil');
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.stage.appendChild(renderer.domElement);

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(38, 1, 0.1, 50);

    this.scene.add(new T.HemisphereLight(0xcfe9ff, 0x0a1a3a, 1.1));
    const key = new T.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const rim = new T.PointLight(0x22e5ff, 14, 8);
    rim.position.set(-2.5, 1.5, -2);
    this.scene.add(rim);

    // platforma: partea de sus la y = 0, deci sub labele animalului
    const base = new T.Mesh(
      new T.CylinderGeometry(1.35, 1.45, 0.14, 48),
      new T.MeshStandardMaterial({ color: 0x0b2a5c, metalness: 0.4, roughness: 0.45 })
    );
    base.position.y = -0.07;
    this.scene.add(base);
    const ring = new T.Mesh(
      new T.RingGeometry(1.15, 1.25, 64),
      new T.MeshBasicMaterial({ color: 0x22e5ff, transparent: true, opacity: 0.85, side: T.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    this.scene.add(ring);

    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const shadow = new T.Mesh(
      new T.PlaneGeometry(2.2, 2.2),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    this.scene.add(shadow);

    // cameră: se rotește doar pe orizontală, cu degetul
    this.camera.position.set(0, 1.3, 4.3);
    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.minPolarAngle = 1.15;
    controls.maxPolarAngle = 1.5;
    controls.update();
    this.controls = controls;

    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.loader.setDRACOLoader(draco);

    this.holder = new T.Group(); // pivot la picioare, pentru animații procedurale
    this.scene.add(this.holder);

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.stage);
    this.resize();
  }

  resize() {
    if (!this.renderer) return;
    const w = this.stage.clientWidth || 300;
    const h = this.stage.clientHeight || 260;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setActive(on) {
    if (!this.renderer) return;
    if (on && !this.active) {
      this.active = true;
      this._t = performance.now();
      this.resize();
      this._raf = requestAnimationFrame(this._loop);
    } else if (!on && this.active) {
      this.active = false;
      cancelAnimationFrame(this._raf);
    }
  }

  _loop = () => {
    if (!this.active) return;
    this._raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    if (now - this._t < 30) return; // ~30 fps, suficient și ușor pentru telefoane slabe
    const dt = Math.min((now - this._t) / 1000, 0.1);
    this._t = now;
    if (this.mixer) this.mixer.update(dt);
    this._procedural(now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  _procedural(now) {
    const h = this.holder;
    const f = this.fx;
    const t = now / 1000;
    h.position.y = 0; h.rotation.set(0, 0, 0);
    this.curScale += (this.growScale - this.curScale) * 0.06; // creștere lină
    const g = this.curScale;
    h.scale.set(g, g * (this.clips.idle ? 1 : 1 + Math.sin(t * 2) * 0.008), g); // respirație ușoară
    if (!f) return;
    const p = (now - f.t0) / (f.dur * 1000);
    if (p >= 1) { this.fx = null; return; }
    const s = Math.sin;
    if (f.type === 'eat') { h.rotation.x = s(p * Math.PI * 6) * 0.16; h.position.y = Math.abs(s(p * Math.PI * 6)) * 0.04; h.scale.y *= 1 - Math.abs(s(p * Math.PI * 6)) * 0.06; }
    else if (f.type === 'play') { h.position.y = Math.abs(s(p * Math.PI * 3)) * 0.4; h.rotation.y = p * Math.PI * 2; }
    else if (f.type === 'pet') { h.rotation.z = s(p * Math.PI * 6) * 0.14; h.position.y = Math.abs(s(p * Math.PI * 3)) * 0.12; h.scale.y *= 1 + Math.abs(s(p * Math.PI * 3)) * 0.05; }
    else { h.position.y = Math.abs(s(p * Math.PI * 2)) * 0.25; }
  }

  /** Reacție: folosește animația din model dacă există, altfel una procedurală. */
  react(type) {
    const keyMap = { eat: 'eat', play: 'happy', pet: 'happy', happy: 'happy' };
    const clip = this.clips[keyMap[type]];
    if (clip && this.mixer) {
      const T = this.T;
      const a = this.mixer.clipAction(clip).reset();
      a.setLoop(T.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.fadeIn(0.15).play();
      const done = (e) => {
        if (e.action !== a) return;
        this.mixer.removeEventListener('finished', done);
        a.fadeOut(0.25);
        if (this.idleAction) this.idleAction.reset().fadeIn(0.25).play();
      };
      this.mixer.addEventListener('finished', done);
      return;
    }
    const dur = { eat: 1.3, play: 1.7, pet: 1.3, happy: 1.2 }[type] || 1.2;
    this.fx = { type, t0: performance.now(), dur };
  }

  _clear() {
    this.fx = null;
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    this.idleAction = null;
    this.clips = {};
    if (this.model) {
      this.holder.remove(this.model);
      this.model.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose();
          m.dispose();
        }
      });
      this.model = null;
    }
  }

  /** Încarcă DOAR animalul selectat (cel precedent este eliberat din memorie). */
  async loadPet(id, scale = 1) {
    const cfg = PETS[id];
    this.growScale = this.curScale = scale;
    const token = ++this.token;
    this._clear();
    if (!cfg) { this.onStatus('error', 'Animal necunoscut.'); return; }
    const T = this.T;
    this.onStatus('loading', `Se încarcă ${cfg.name}…`);
    try {
      const gltf = await this.loader.loadAsync(cfg.file, (e) => {
        if (e.total && token === this.token) this.onStatus('loading', `Se încarcă ${cfg.name}… ${Math.round((e.loaded / e.total) * 100)}%`);
      });
      if (token !== this.token) return; // utilizatorul a schimbat între timp animalul
      const model = gltf.scene;
      model.rotation.y = cfg.rotY || 0;
      model.updateMatrixWorld(true);
      let box = new T.Box3().setFromObject(model);
      const size = box.getSize(new T.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (!isFinite(maxDim) || maxDim <= 0) throw new Error('Modelul pare gol.');
      model.scale.setScalar((TARGET_SIZE / maxDim) * (cfg.scale || 1));
      model.updateMatrixWorld(true);
      box = new T.Box3().setFromObject(model);
      const ctr = box.getCenter(new T.Vector3());
      model.position.x -= ctr.x;
      model.position.z -= ctr.z;
      model.position.y -= box.min.y; // labele ating podeaua (y = 0)
      model.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.6;
        }
      });
      this.holder.add(model);
      this.model = model;

      const h = box.max.y - box.min.y;
      this.controls.target.set(0, h * 0.45, 0);
      this.camera.position.set(0, h * 0.45 + 0.6, 4.3);
      this.controls.update();

      if (gltf.animations && gltf.animations.length) {
        this.mixer = new T.AnimationMixer(model);
        const find = (key, re) => {
          const n = cfg.clips && cfg.clips[key];
          return n ? gltf.animations.find((c) => c.name === n) : gltf.animations.find((c) => re.test(c.name));
        };
        this.clips = {
          idle: find('idle', /idle|stand|breath|rest/i),
          walk: find('walk', /walk|run/i),
          eat: find('eat', /eat|drink/i),
          happy: cfg.clips && cfg.clips.happy ? find('happy') : find('happy', /happy|jump|joy|bark|meow|wag/i),
        };
        if (this.clips.idle) {
          this.idleAction = this.mixer.clipAction(this.clips.idle);
          this.idleAction.play();
        }
      }
      this.onStatus('ok');
    } catch (e) {
      if (token !== this.token) return;
      console.error('[pets] încărcare model eșuată', e);
      this.onStatus(
        'error',
        `Modelul 3D pentru ${cfg.name} nu a putut fi încărcat (${cfg.file}). Verifică dacă fișierul există în assets/pets/ și dacă numele din pets.js este corect.`
      );
    }
  }
}
