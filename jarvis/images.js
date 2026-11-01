// Pictures created by Jarvis: his AI plans the picture (subject, style, light,
// composition) and the free Pollinations image generator (no key) renders it.
import { generateJson, llmProvider } from './llm.js';

const SIZES = { quadrat: [1024, 1024], hoch: [832, 1216], quer: [1216, 832] };

export function imageUrl(prompt, { format = 'quadrat', seed = Math.floor(Math.random() * 1e6) } = {}) {
  const [width, height] = SIZES[format] || SIZES.quadrat;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 900))}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
}

export async function planImage(description, { generate = generateJson } = {}) {
  const wish = String(description ?? '').trim().slice(0, 600);
  if (!wish) throw new Error('Was soll ich malen?');
  if (!llmProvider() && generate === generateJson) return { title: wish.slice(0, 60), prompt: wish };
  try {
    const reply = await generate({
      system: 'Du bist der Bild-Designer von Jarvis. Du planst ein Bild nach dem Wunsch des Nutzers und schreibst dafür einen detaillierten englischen Bild-Prompt (Motiv, Umgebung, Stil, Licht, Perspektive, Farben, Qualität). Keine echten, namentlich bekannten Personen, keine Marken-Logos, nichts Gewalttätiges oder Sexuelles. Antworte nur mit JSON.',
      prompt: `Wunsch: ${wish}\nJSON: {"title":"kurzer deutscher Titel","prompt":"detailed English prompt, max 70 words"}`,
      maxTokens: 600
    });
    const prompt = String(reply.prompt || '').trim();
    return { title: String(reply.title || wish).slice(0, 60), prompt: prompt || wish };
  } catch {
    return { title: wish.slice(0, 60), prompt: wish };
  }
}
