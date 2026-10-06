// Dictée vocale: Web Speech API dans le navigateur (Chrome, Safari),
// module natif dans l'app Android / iPhone (la WebView n'a pas la dictée web).
//
// Règles: on écoute jusqu'à « Arrêter » (une pause ne coupe pas), et à l'arrêt on ATTEND la dernière phrase
// (le téléphone la livre une fraction de seconde après) avant de rendre le texte complet.
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

/** onEnd(err, texte final): le texte final est celui à utiliser (complet, même s'il arrive après « Arrêter »). */
export type OnEnd = (err?: string, text?: string) => void;

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

export function listen(onText: (text: string, final: boolean) => void, onEnd: OnEnd): Listening | null {
  if (isNative()) return listenNative(onText, onEnd);
  const w = window as any;
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Rec) return null;
  // Android (Chrome): le mode continu répète les mots → phrases courtes relancées automatiquement
  const android = /Android/i.test(navigator.userAgent);
  let before = ''; // texte des sessions précédentes
  let session = ''; // texte de la session en cours
  let stopped = false;
  let ended = false;
  let rec: any;
  const text = () => clean(`${before} ${session}`);
  const finish = (err?: string) => {
    if (ended) return;
    ended = true;
    const t = text();
    // Une erreur après qu'on ait déjà du texte n'empêche pas de l'utiliser
    onEnd(t ? undefined : err, t);
  };
  const start = () => {
    session = '';
    rec = new Rec();
    rec.lang = 'fr-CA';
    rec.interimResults = true;
    rec.continuous = !android;
    rec.onresult = (e: any) => {
      let fin = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript + ' ';
        else interim += r[0].transcript + ' ';
      }
      session = clean(fin + interim);
      onText(text(), !interim.trim());
    };
    rec.onerror = (e: any) => {
      if ((e.error === 'no-speech' || e.error === 'aborted') && !stopped) return; // silence: on relance (onend)
      if (e.error === 'no-speech' && stopped) return;
      stopped = true;
      finish(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro refusé: autorise le micro pour cette app (icône du cadenas à côté de l’adresse).' : e.error === 'no-speech' ? 'Je n’ai rien entendu.' : e.error === 'network' ? 'La dictée a besoin d’Internet.' : `Dictée: ${e.error}`);
    };
    rec.onend = () => {
      if (stopped) return finish();
      // Pause: on relance tant qu'on n'a pas appuyé sur « Arrêter »
      before = text();
      try {
        start();
      } catch {
        stopped = true;
        finish();
      }
    };
    rec.start();
  };
  start();
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        rec.stop(); // la dernière phrase arrive dans onresult, puis onend → finish
      } catch {
        finish();
      }
      setTimeout(() => finish(), 2500); // filet de sécurité
    },
  };
}

function listenNative(onText: (text: string, final: boolean) => void, onEnd: OnEnd): Listening {
  // Module Android: stop() ne répond jamais, « stopped » arrive AVANT la dernière phrase, et après un silence
  // le micro se coupe sans rien dire. Donc: on n'attend jamais stop(), on laisse ~0,8 s à la dernière phrase,
  // et un garde vérifie chaque seconde que le micro écoute encore (sinon on le relance).
  let stopped = false;
  let ended = false;
  let restarting = false;
  let before = '';
  let session = '';
  let handles: { remove: () => Promise<void> }[] = [];
  let SR: any;
  let guard: ReturnType<typeof setInterval> | undefined;
  const text = () => clean(`${before} ${session}`);
  const finish = async (err?: string) => {
    if (ended) return;
    ended = true;
    stopped = true;
    if (guard) clearInterval(guard);
    const t = text();
    onEnd(t ? undefined : err, t);
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
  };
  const go = async () => {
    if (stopped) return;
    before = text();
    session = '';
    try {
      await SR.start({ language: 'fr-CA', partialResults: true, popup: false, maxResults: 1 });
    } catch {
      /* déjà en écoute / erreur passagère: le garde réessaiera */
    }
  };
  const restartSoon = (ms: number) => {
    if (restarting || stopped) return;
    restarting = true;
    setTimeout(() => {
      restarting = false;
      void go();
    }, ms);
  };
  (async () => {
    try {
      SR = (await import('@capacitor-community/speech-recognition')).SpeechRecognition;
      const { available } = await SR.available();
      if (!available) return void finish('La dictée n’est pas disponible sur ce téléphone.');
      const perm = await SR.requestPermissions();
      if (perm.speechRecognition !== 'granted') return void finish('Micro refusé: autorise le micro pour l’app dans les réglages du téléphone.');
      handles = [
        await SR.addListener('partialResults', (d: { matches: string[] }) => {
          if (!d.matches?.[0] || ended) return;
          session = d.matches[0];
          onText(text(), false);
        }),
        await SR.addListener('listeningState', (d: { status: string }) => {
          if (d.status !== 'stopped' || ended) return;
          if (stopped) return void setTimeout(() => void finish(), 800); // la dernière phrase arrive juste après
          restartSoon(800); // pause: on relance après avoir reçu la phrase
        }),
      ];
      await go();
      guard = setInterval(async () => {
        if (stopped || restarting) return;
        try {
          const { listening } = await SR.isListening();
          if (!listening) restartSoon(100);
        } catch {
          /* ignore */
        }
      }, 1200);
    } catch (e) {
      void finish(e instanceof Error ? e.message : String(e));
    }
  })();
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (guard) clearInterval(guard);
      void SR?.stop().catch(() => undefined); // ne répond jamais: on n'attend pas
      setTimeout(() => void finish(), 1300);
    },
  };
}
