// Commande vocale complète, ex.:
//   « Véronique Girard, 12 rue des Pins à Laval, entretien de gouttières 60 pieds linéaires mardi à 9 h »
// → nouveau client (ou client existant), adresse, job planifiée mardi 9 h, lignes de soumission.
// Fonctionne sans Internet: règles simples + l'analyse des services de voice.ts.
import { parseDictation, wordsToNumbers, type VoiceClient, type VoiceService } from './voice.ts';

export interface JobCommand {
  clientId?: number;
  clientName: string; // client existant ou nom du nouveau client
  isNew: boolean;
  phone?: string;
  address?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  lines: { code: string; quantity: number }[];
  leftovers: string[];
  kind: 'visite' | 'job'; // visite d'estimation (la soumission vient après) ou job à faire
  docType: 'quote' | 'invoice'; // « facture pour … » → facture directe; sinon soumission
  dateSaid: boolean; // une journée a été dite
  addressIncomplete: boolean; // adresse coupée (« 1835 rue des »): à redemander
}

// Mots de phrase (« j'ai une soumission… », « faudrait faire… »): jamais un nom de client
const NAME_FILLER = ['je', 'j', 'jai', 'ai', 'veux', 'voudrais', 'aimerais', 'aurais', 'faut', 'faudrait', 'faire', 'fasse', 'une', 'un', 'il', 'elle', 'on', 'besoin', 'que', 'peux', 'tu', 'svp', 'mets', 'met', 'ok', 'bon', 'alors', 'euh', 'faque', 'donc', 'nom', 'client', 'cliente'];
const NAME_STOP = ['au', 'aux', 'a', 'sur', 'dans', 'de', 'du', 'des', 'rue', 'chemin', 'boulevard', 'avenue', 'qui', 'reste', 'demeure', 'habite', 'adresse'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const STREET = '(?:rue|avenue|av|boulevard|boul|bd|chemin|ch|rang|montee|place|croissant|route|rte|impasse|terrasse|allee|promenade|cote|carre|square|ruelle|voie|chemin du|rang du)';
// Mots qui annoncent la fin de l'adresse (début de la job ou de la date)
const JOB_WORDS = ['visite', 'rendez', 'rdv', 'planifier', 'planifie', 'job', 'jobs', 'travaux', 'pour', 'entretien', 'nettoyage', 'lavage', 'installation', 'reparation', 'soumission', 'estimation', 'inspection', 'peinture', 'tonte', 'deneigement', 'demain', 'aujourd', 'apres', 'ce', 'cette', 'le', 'la', 'semaine', 'prochain', 'prochaine', ...DAYS];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cap = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Date et heure dites (« demain », « mardi », « le 14 octobre », « à 9 h 30 », « en après-midi »). */
export function findWhen(t: string, today: string): { date: string; time?: string; rest: string } {
  const base = new Date(today + 'T12:00:00');
  let date = today;
  let rest = t;
  const cut = (re: RegExp) => {
    rest = rest.replace(re, ' ');
  };
  let m: RegExpMatchArray | null;
  if ((m = rest.match(/\bapres[-\s]?demain\b/))) {
    base.setDate(base.getDate() + 2);
    date = iso(base);
    cut(/\bapres[-\s]?demain\b/);
  } else if ((m = rest.match(/\bdemain\b/))) {
    base.setDate(base.getDate() + 1);
    date = iso(base);
    cut(/\bdemain\b/);
  } else if ((m = rest.match(/\baujourd\s?hui\b/))) {
    cut(/\baujourd\s?hui\b/);
  } else if ((m = rest.match(new RegExp(`\\b(?:le\\s+)?(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')})\\b`)))) {
    const d = new Date(base);
    d.setMonth(MONTHS.indexOf(m[2]), Number(m[1]));
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    date = iso(d);
    cut(new RegExp(m[0].replace(/\s+/g, '\\s+')));
  } else if ((m = rest.match(new RegExp(`\\b(?:ce\\s+|cette\\s+)?(${DAYS.join('|')})(\\s+prochain|\\s+qui\\s+vient)?\\b`)))) {
    const target = DAYS.indexOf(m[1]);
    let add = (target - base.getDay() + 7) % 7;
    if (add === 0) add = 7;
    base.setDate(base.getDate() + add);
    date = iso(base);
    cut(new RegExp(m[0].replace(/\s+/g, '\\s+')));
  }
  let time: string | undefined;
  if ((m = rest.match(/\b(?:a|vers|pour)?\s*(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/))) {
    const h = Number(m[1]);
    if (h >= 5 && h <= 21) {
      time = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
      cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } else if (/\bmatin\b/.test(rest)) {
    time = '08:00';
    cut(/\b(?:le|en|dans\s+l)?\s*matin(?:ee)?\b/);
  } else if (/\bapres[-\s]?midi\b/.test(rest)) {
    time = '13:00';
    cut(/\b(?:l|en|dans\s+l)?\s*apres[-\s]?midi\b/);
  } else if (/\bmidi\b/.test(rest)) {
    time = '12:00';
    cut(/\b(?:a\s+)?midi\b/);
  }
  return { date, time, rest };
}

export function parseJobCommand(input: string, services: VoiceService[], clients: VoiceClient[], today: string): JobCommand {
  // On garde les accents pour le nom et l'adresse; les recherches se font sur une copie sans accents de même longueur
  // « 18-35 rue … » / « 18 35 rue … » (dictée du cell) → 1835
  input = input.normalize('NFC').replace(/\b(\d{1,3})[-\s](\d{2,3})(?=[\s,]+(?:rue|avenue|av|boul|boulevard|chemin|ch|rang|mont[ée]e|place|croissant|route|impasse|terrasse|all[ée]e|promenade|c[ôo]te)\b)/gi, '$1$2');
  let orig = ` ${input.replace(/\s+/g, ' ').trim()} `;
  const low = () => norm(orig);

  // Téléphone
  let phone: string | undefined;
  const pm = orig.match(/(\d{3})[\s.-]*(\d{3})[\s.-]*(\d{4})/);
  if (pm) {
    phone = `${pm[1]}-${pm[2]}-${pm[3]}`;
    orig = orig.replace(pm[0], ' ');
  }

  // Client existant?
  const known = parseDictation(input, services, clients);
  let existing = known.clientId !== undefined ? clients.find((c) => c.id === known.clientId) : undefined;

  // Adresse: numéro civique + type de rue + quelques mots, jusqu'au début de la job / de la date
  let address: string | undefined;
  let nameEnd = -1;
  const am = low().match(new RegExp(`\\s(\\d{1,6}[a-z]?)[,\\s]+(${STREET})\\b`));
  if (am && am.index !== undefined) {
    const start = am.index + 1;
    const words = orig.slice(start).split(/\s+/).filter(Boolean);
    const kept: string[] = [];
    const svcWords = new Set(services.flatMap((s) => norm(s.name).split(/[^a-z]+/).filter((w) => w.length >= 5)));
    for (const w of words) {
      const n = norm(w).replace(/[^a-z0-9]/g, '');
      const parts = norm(w).split(/[^a-z0-9]+/).filter(Boolean);
      const isJob = parts.some((p) => JOB_WORDS.includes(p) || svcWords.has(p) || svcWords.has(p.replace(/s$/, '')));
      if (kept.length >= 2 && (isJob || (/^\d/.test(n) && kept.length >= 3))) break;
      kept.push(w);
      if (kept.length >= 9) break;
    }
    const raw = kept.join(' ');
    address = raw.replace(/\s+(?:à|a|au)\s+/i, ', ').replace(/[,.\s]+$/, '').replace(/,\s*,/g, ',');
    address = address.replace(/\b(\d+)\s*,\s*/, '$1 ');
    nameEnd = start;
    orig = orig.slice(0, start) + ' ' + orig.slice(start + raw.length);
  } else {
    // « au 1562 Edmond à Laval » (sans « rue »)
    const bm = low().match(/\s(?:au|a|chez)\s+(\d{1,6}[a-z]?)\s+([a-z][a-z'-]{2,})(?:\s+(?:a|au)\s+([a-z][a-z' -]{2,}?))?(?=\s|,|$)/);
    if (bm && bm.index !== undefined && !JOB_WORDS.includes(bm[2])) {
      const start = bm.index + 1;
      const raw = orig.slice(start, start + bm[0].length - 1);
      address = raw.replace(/^(?:au|à|a|chez)\s+/i, '').replace(/\s+(?:à|a|au)\s+/i, ', ').trim();
      nameEnd = start;
      orig = orig.slice(0, start) + ' ' + orig.slice(start + raw.length);
    }
  }

  // « le nom de la personne c'est Jean Roy », « le client c'est… », « elle s'appelle… » (n'importe où dans la phrase)
  let saidName: string | undefined;
  {
    const nm = norm(orig).match(/\s(?:(?:le|son)\s+nom(?:\s+(?:de\s+la\s+personne|du\s+client|de\s+la\s+cliente|du\s+monsieur|de\s+la\s+madame))?|(?:le|la)\s+client(?:e)?|(?:il|elle)\s+s['’]?\s*appelle|(?:qui\s+)?s['’]?\s*appelle)\s*(?:c['’]?\s*est|c\s+est|est|:)?\s*/);
    if (nm && nm.index !== undefined) {
      const start = nm.index;
      const after = orig.slice(start + nm[0].length);
      const words = after.split(/[\s,]+/).filter(Boolean);
      const out: string[] = [];
      for (const w of words) {
        const n = norm(w).replace(/[^a-z]/g, '');
        if (!n || JOB_WORDS.includes(n) || NAME_STOP.includes(n) || NAME_FILLER.includes(n) || /\d/.test(w) || ['et', 'puis', 'pis', 'pi', 'avec', 'son', 'sa', 'tel', 'telephone', 'numero', 'cest', 'est'].includes(n)) break;
        out.push(w.replace(/[,.]/g, ''));
        if (out.length >= 4) break;
      }
      saidName = cap(out.join(' '));
      const raw = orig.slice(start, start + nm[0].length) + (out.length ? after.slice(0, after.indexOf(out[out.length - 1]) + out[out.length - 1].length) : '');
      orig = orig.slice(0, start) + ' ' + orig.slice(start + raw.length);
      if (nameEnd > start) nameEnd = Math.max(0, nameEnd - raw.length + 1);
    }
  }

  // Nom du nouveau client: ce qui précède l'adresse (ou le début de la phrase jusqu'au premier mot de job)
  let clientName = '';
  // « Planifie une visite chez … », « mets une job pour … »: la commande du début n'est pas le nom
  const cmd = norm(orig).match(/^\s*(?:(?:planifi|ajout|met|cre|book|fais|fait|prepar|factur)\w*\s+)?(?:(?:une?|la|le|moi)\s+)?(?:(?:visite|job|estimation|evaluation|soumission|facture|rendez-vous|rendez vous|rdv)\s+)?(?:(?:d'|de\s+)?(?:estimation|soumission)\s+)?(?:(?:chez|pour|avec)\s+)?/);
  const cmdLen = cmd ? cmd[0].length : 0;
  {
    let head = nameEnd > 0 ? orig.slice(cmdLen, nameEnd) : orig.slice(cmdLen);
    head = head.replace(/^[\s,]*(?:(?:nouveau|nouvelle)\s+)?(?:client|cliente)?\s*(?:c'est\s+)?(?:chez|pour)?\s*/i, '');
    const words = head.split(/[\s,]+/).filter(Boolean);
    const out: string[] = [];
    for (const w of words) {
      const n = norm(w).replace(/[^a-z]/g, '');
      if (!n || JOB_WORDS.includes(n) || NAME_STOP.includes(n) || NAME_FILLER.includes(n) || /\d/.test(w)) break;
      out.push(w.replace(/[,.]/g, ''));
      if (out.length >= 4) break;
    }
    if (saidName !== undefined) out.length = 0; // le nom a été dit clairement ailleurs
    clientName = saidName || cap(out.join(' '));
    if (saidName && !existing) existing = clients.find((c) => norm(c.name) === norm(saidName!));
    // « Sylvie Roy » n'est pas « Mme Roy »: un prénom de plus = un autre client
    if (existing && clientName) {
      const have = new Set(norm(existing.name).split(/[^a-z]+/));
      if (!norm(clientName).split(/[^a-z]+/).filter((w) => w.length >= 2 && !['mme', 'madame', 'monsieur', 'chez'].includes(w)).every((w) => have.has(w))) existing = undefined;
    }
    if (existing) clientName = existing.name;
    if (out.length) orig = orig.replace(new RegExp(out.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s,]+')), ' ');
  }

  // Date, heure, puis les services sur ce qui reste
  const kind: JobCommand['kind'] = /\b(visite|estimation|evaluation|aller voir|rendez[-\s]?vous|rdv)\b/.test(norm(input)) ? 'visite' : 'job';
  orig = cmdLen ? ' ' + orig.slice(cmdLen) : orig;
  const before = wordsToNumbers(norm(orig));
  const when = findWhen(before, today);
  const r = parseDictation(when.rest, services, []);
  const docType: JobCommand['docType'] = /\bfactur/.test(norm(input)) && !/\bsoumission/.test(norm(input)) ? 'invoice' : 'quote';
  const last = address ? norm(address).split(/[^a-z0-9]+/).filter(Boolean).pop() ?? '' : '';
  const addressIncomplete = !!address && (address.split(/\s+/).length < 3 || ['des', 'de', 'du', 'la', 'le', 'l', 'rue', 'chemin', 'boulevard', 'avenue', 'rang', 'boul'].includes(last));
  return {
    clientId: existing?.id, clientName, isNew: !existing, phone, address, date: when.date, time: when.time, lines: r.lines,
    leftovers: kind === 'visite' ? [] : r.leftovers.filter((l) => !/^(au|a|de|des|du|pour|chez)$/.test(l.trim())), kind, docType, dateSaid: when.rest !== before, addressIncomplete,
  };
}
