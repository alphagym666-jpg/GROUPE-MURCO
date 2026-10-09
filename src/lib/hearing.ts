// Écoute « intelligente »: on enregistre la voix et Gemini la transcrit (bien meilleur que la dictée du téléphone,
// surtout en français québécois, avec les noms de clients et de services).
import { getAI, getGenerativeModel, VertexAIBackend } from 'firebase/ai';
import { firebaseApp } from './sync';
import { listen, type Listening, type OnEnd } from './speech';

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
let hints: string[] = [];
// Micro web refusé (ex.: ancienne app Android): on reste sur la dictée du téléphone pour le reste de la session.
let webMicDenied = false;

/** Noms de clients et de services: aident Gemini à bien écrire ce qu'il entend. */
export function setHearingHints(list: string[]) {
  hints = [...new Set(list.map((x) => x.trim()).filter(Boolean))].slice(0, 80);
}

export function hearingSupported(): boolean {
  return !webMicDenied && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function transcribe(blob: Blob): Promise<string> {
  const app = firebaseApp();
  if (!app) throw new Error('Firebase n’est pas configuré');
  const ai = getAI(app, { backend: new VertexAIBackend('global') });
  const data = await toBase64(blob);
  const mimeType = (blob.type || 'audio/webm').split(';')[0];
  const prompt =
    'Tu es un transcripteur. Écris mot pour mot ce qui est dit dans cet enregistrement, en français (québécois). ' +
    'Un entrepreneur parle de factures, soumissions, clients, gouttières, lavage de vitres, déneigement, dates et adresses. ' +
    'Noms possibles: ' + hints.join(', ') + '. Écris les nombres en chiffres. ' +
    'Réponds uniquement avec le texte dit, sans commentaire. S’il n’y a aucune parole, réponds exactement: [vide]';
  let last: unknown;
  for (const model of MODELS) {
    try {
      const r = await getGenerativeModel(ai, { model, generationConfig: { temperature: 0 } }, { timeout: 15000 }).generateContent([prompt, { inlineData: { mimeType, data } }]);
      return r.response.text().trim();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Même contrat que listen(): on enregistre jusqu'à « Arrêter », puis Gemini rend le texte. */
export function listenCloud(onText: (text: string, final: boolean) => void, onEnd: OnEnd): Listening | null {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let fallback: Listening | null = null;
  let stopRequested = false;
  const chunks: Blob[] = [];
  const release = () => stream?.getTracks().forEach((t) => t.stop());
  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((s) => {
      stream = s;
      const mr = new MediaRecorder(s);
      rec = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = async () => {
        release();
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 1500) return onEnd('Je n’ai rien entendu.');
        onText('…je réfléchis…', false);
        try {
          const t = await transcribe(blob);
          if (!t || /^\[vide\]$/i.test(t)) onEnd('Je n’ai rien entendu.');
          else onEnd(undefined, t);
        } catch {
          onEnd('Je n’arrive pas à t’entendre pour le moment (Internet?). Écris la phrase.');
        }
      };
      mr.start();
      if (stopRequested) mr.stop();
    })
    .catch(() => {
      // Le téléphone bloque l'enregistrement web: on passe à sa dictée à lui, sans rien demander de plus.
      webMicDenied = true;
      if (stopRequested) return onEnd('Je n’ai rien entendu.');
      fallback = listen(onText, onEnd);
      if (!fallback) onEnd('Micro refusé: autorise le micro pour cette app dans les réglages du téléphone.');
    });
  return {
    stop: () => {
      stopRequested = true;
      if (fallback) fallback.stop();
      else if (rec && rec.state !== 'inactive') rec.stop();
    },
  };
}
