import { useEffect, useRef, useState } from 'react';

/**
 * Affiche un PDF directement dans l'app (pages dessinées une à une), comme un vrai aperçu.
 * Les cellulaires ne savent pas afficher un PDF dans une page: on le dessine nous-mêmes avec pdf.js.
 */
export function PdfView({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    el.innerHTML = '';
    setState('loading');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const width = Math.max(280, el.clientWidth || 600);
        const ratio = Math.min(3, window.devicePixelRatio || 1);
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.className = 'pdf-page';
          canvas.setAttribute('aria-label', `Page ${n}`);
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        }
        if (!cancelled) setState('ok');
        void doc.destroy();
      } catch {
        if (!cancelled) setState('err');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <div className="pdf-view">
      {state === 'loading' && <div className="pdf-loading"><span className="pdf-skel" /></div>}
      {state === 'err' && <div className="notice err">Aperçu impossible sur cet appareil — utilise « Télécharger ».</div>}
      <div ref={box} className="pdf-pages" />
    </div>
  );
}
