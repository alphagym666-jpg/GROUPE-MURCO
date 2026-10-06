// Recherche de clients qui tolère les fautes de la dictée (Denise / Deniz / Dénise).
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
/** Simplifie l'orthographe (Denise / Dénise / Deniz, Philippe / Filip). */
const sound = (w: string) => w.replace(/ph/g, 'f').replace(/h/g, '').replace(/y/g, 'i').replace(/z/g, 's').replace(/(qu|k|ck)/g, 'c').replace(/(.)\1+/g, '$1').replace(/[es]+$/, '');
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** Clients qui ressemblent au nom dit (fautes de la dictée tolérées). */
export function findClients<T extends { name: string }>(query: string, clients: T[], max = 5): T[] {
  const q = norm(query).split(' ').filter((w) => w.length >= 2 && !['mme', 'madame', 'monsieur', 'chez', 'pour', 'de', 'la', 'le'].includes(w));
  if (!q.length) return [];
  const scored = clients.map((c) => {
    const words = norm(`${c.name}`).split(' ').filter(Boolean);
    let score = 0;
    for (const w of q) {
      let best = 0;
      for (const x of words) {
        if (x === w) best = Math.max(best, 3);
        else if (x.startsWith(w) && w.length >= 3) best = Math.max(best, 2);
        else if (sound(x) === sound(w)) best = Math.max(best, 2);
        else if (w.length >= 4 && lev(x, w) <= (w.length >= 7 ? 2 : 1)) best = Math.max(best, 1);
      }
      score += best;
    }
    return { c, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.c);
}

