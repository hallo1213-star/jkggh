// Computes voice prints off the main thread (animations stay smooth).
import { embedUtterance, loadWeights } from './voice-id.js';

let model = null;
async function getModel() {
  if (model) return model;
  const response = await fetch('/voice-encoder.bin');
  if (!response.ok) throw new Error('Stimm-Modell nicht geladen');
  model = loadWeights(await response.arrayBuffer());
  return model;
}

self.onmessage = async ({ data }) => {
  try {
    const m = await getModel();
    if (data.warmup) { self.postMessage({ id: data.id, ok: true }); return; }
    const print = embedUtterance(m, data.wav, { maxPartials: data.maxPartials || 4 });
    self.postMessage({ id: data.id, print }, [print.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
};
