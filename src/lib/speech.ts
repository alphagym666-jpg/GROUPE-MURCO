// Dictée vocale (Web Speech API: Chrome Android/ordi, Safari iPhone).
/* eslint-disable @typescript-eslint/no-explicit-any */

export function speechSupported(): boolean {
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Listening {
  stop: () => void;
}

export function listen(onText: (text: string, final: boolean) => void, onEnd: (err?: string) => void): Listening | null {
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
