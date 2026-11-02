// Shared loader for MediaPipe (hands, person segmentation). Loaded only when an
// effect needs it; everything runs on this device.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  segment: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
};
let base = null;
const cache = {};

async function vision() {
  if (!base) {
    base = (async () => {
      const lib = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
      const files = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      return { lib, files };
    })().catch((error) => { base = null; throw error; });
  }
  return base;
}
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} lädt nicht (Internet prüfen)`)), ms))]);

export function handTracker() {
  cache.hand = cache.hand || timeout((async () => {
    const { lib, files } = await vision();
    return lib.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.hand }, runningMode: 'VIDEO', numHands: 1 });
  })(), 30000, 'Handerkennung').catch((e) => { cache.hand = null; throw e; });
  return cache.hand;
}

export function personSegmenter(mode = 'VIDEO') {
  const key = `seg-${mode}`;
  cache[key] = cache[key] || timeout((async () => {
    const { lib, files } = await vision();
    return lib.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.segment }, runningMode: mode, outputCategoryMask: false, outputConfidenceMasks: true });
  })(), 30000, 'Personenerkennung').catch((e) => { cache[key] = null; throw e; });
  return cache[key];
}

// Front camera as a <video>.
export async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function cameraError(error) {
  return error?.name === 'NotAllowedError' ? 'Kamera nicht erlaubt – bitte im Browser freigeben.' : `Kamera nicht verfügbar: ${error?.message || error}`;
}
