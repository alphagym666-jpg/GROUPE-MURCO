// Dictée vocale: Web Speech API dans le navigateur (Chrome, Safari),
// module natif dans l'app Android / iPhone (la WebView n'a pas la dictée web).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isNative } from './native';

export function speechSupported(): boolean {
  if (isNative()) return true;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Listening {
  stop: () => void;
}

export function listen(onText: (text: string, final: boolean) => void, onEnd: (err?: string) => void): Listening | null {
  if (isNative()) return listenNative(onText, onEnd);
  const w = window as any;
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = 'fr-CA';
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    onText((finalText + interim).trim(), !interim);
  };
  rec.onerror = (e: any) => onEnd(e.error === 'not-allowed' ? 'Micro refusé: autorise le micro pour cette app.' : e.error === 'no-speech' ? 'Je n’ai rien entendu.' : `Dictée: ${e.error}`);
  rec.onend = () => onEnd();
  rec.start();
  return { stop: () => rec.stop() };
}

function listenNative(onText: (text: string, final: boolean) => void, onEnd: (err?: string) => void): Listening {
  let stopped = false;
  let handles: { remove: () => Promise<void> }[] = [];
  let SR: any;
  const finish = async (err?: string) => {
    if (stopped) return;
    stopped = true;
    await Promise.all(handles.map((h) => h.remove()));
    onEnd(err);
  };
  (async () => {
    try {
      SR = (await import('@capacitor-community/speech-recognition')).SpeechRecognition;
      const { available } = await SR.available();
      if (!available) return finish('La dictée n’est pas disponible sur ce téléphone.');
      const perm = await SR.requestPermissions();
      if (perm.speechRecognition !== 'granted') return finish('Micro refusé: autorise le micro pour Murco dans les réglages.');
      handles = [
        await SR.addListener('partialResults', (d: { matches: string[] }) => d.matches?.[0] && onText(d.matches[0], false)),
        await SR.addListener('listeningState', (d: { status: string }) => d.status === 'stopped' && finish()),
      ];
      await SR.start({ language: 'fr-CA', partialResults: true, popup: false, maxResults: 1 });
    } catch (e) {
      finish(e instanceof Error ? e.message : String(e));
    }
  })();
  return {
    stop: () => {
      void SR?.stop().finally(() => finish());
    },
  };
}
