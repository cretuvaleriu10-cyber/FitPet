// camera.js – acces la camera telefonului (procesarea rămâne local; nu se trimite nimic pe server).

export class CameraError extends Error {
  constructor(code, userMessage) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
  }
}

function mapError(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError')
    return new CameraError('denied', 'Accesul la cameră a fost refuzat. Permite camera din setările browserului (iconița de lângă adresă) și încearcă din nou.');
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError')
    return new CameraError('notfound', 'Nu am găsit nicio cameră pe acest dispozitiv.');
  if (n === 'NotReadableError' || n === 'TrackStartError')
    return new CameraError('busy', 'Camera este folosită de altă aplicație. Închide-o și încearcă din nou.');
  if (n === 'SecurityError')
    return new CameraError('insecure', 'Camera necesită o conexiune sigură (localhost sau HTTPS).');
  return new CameraError('unknown', 'Nu am putut porni camera: ' + (e && e.message ? e.message : 'eroare necunoscută'));
}

export class CameraController {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'user';
  }

  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start(facing = this.facing) {
    if (!window.isSecureContext)
      throw new CameraError('insecure', 'Camera funcționează doar pe localhost sau HTTPS. Deschide aplicația prin http://localhost:… sau un link https.');
    if (!CameraController.supported())
      throw new CameraError('unsupported', 'Browserul nu suportă accesul la cameră.');
    this.stop();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
    } catch (e) {
      if (e && e.name === 'OverconstrainedError') {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch (e2) { throw mapError(e2); }
      } else {
        throw mapError(e);
      }
    }
    this.stream = stream;
    this.facing = facing;
    const v = this.video;
    v.srcObject = stream;
    v.muted = true;
    v.setAttribute('playsinline', '');
    // oglindește previzualizarea (și scheletul) doar pentru camera frontală
    if (v.parentElement) v.parentElement.classList.toggle('mirror', facing === 'user');
    await new Promise((res) => {
      if (v.readyState >= 1) return res();
      v.onloadedmetadata = () => res();
    });
    try { await v.play(); } catch (e) { throw new CameraError('unknown', 'Nu am putut reda imaginea camerei.'); }
  }

  async flip() {
    return this.start(this.facing === 'user' ? 'environment' : 'user');
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}
