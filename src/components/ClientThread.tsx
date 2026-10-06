import { useLiveQuery } from 'dexie-react-hooks';
import { Mail, MessageSquare, Phone, PhoneIncoming, Plus, Sparkles, StickyNote, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db, type Client, type ClientMessage, type MessageChannel } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { formatDate, todayISO } from '../lib/utils';
import { errMsg, useToast } from './Toast';

const CH_ICON: Record<MessageChannel, typeof Mail> = { texto: MessageSquare, courriel: Mail, appel: Phone, note: StickyNote };
const CH_LABEL: Record<MessageChannel, string> = { texto: 'Texto', courriel: 'Courriel', appel: 'Appel', note: 'Note' };

/** Modèles rapides (le prénom et l'entreprise sont remplis). */
function templates(first: string, me: string, company: string): { label: string; text: string }[] {
  const sig = me ? `\n${me}${company ? `, ${company}` : ''}` : '';
  return [
    { label: 'En route', text: `Bonjour ${first}, je suis en route, j’arrive dans environ 20 minutes.${sig}` },
    { label: 'Rappel de rendez-vous', text: `Bonjour ${first}, petit rappel de notre rendez-vous demain. Au plaisir!${sig}` },
    { label: 'Suivi de soumission', text: `Bonjour ${first}, avez-vous eu la chance de regarder la soumission? Je reste disponible pour vos questions.${sig}` },
    { label: 'Job terminée', text: `Bonjour ${first}, c’est terminé chez vous. Merci de votre confiance! La facture suit par courriel.${sig}` },
    { label: 'Merci + avis', text: `Merci ${first}! Si vous êtes satisfait, un avis Google nous aiderait beaucoup.${sig}` },
  ];
}

const when = (iso: string) => {
  const d = iso.slice(0, 10);
  const t = new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  return d === todayISO() ? t : `${formatDate(d)} · ${t}`;
};

/** Conversation avec le client: textos, courriels, appels et notes au même endroit. */
export function ClientThread({ client }: { client: Client }) {
  const s = useSettings();
  const notify = useToast();
  const msgs = useLiveQuery(() => db.messages.where('clientId').equals(client.id!).sortBy('at'), [client.id]) ?? [];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const first = (client.contact || client.name).replace(/^(mme|m\.|madame|monsieur)\s+/i, '').split(' ')[0];
  const me = s.ownerName.split(' ')[0];
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  const log = (dir: ClientMessage['dir'], channel: MessageChannel, body = text) =>
    db.messages.add({ clientId: client.id!, dir, channel, text: body.trim(), at: new Date().toISOString(), author: me || undefined });

  const sendSms = () => {
    if (!text.trim()) return;
    if (!client.phone) return notify('Ajoute le cellulaire du client.', 'err');
    window.location.href = `sms:${client.phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text.trim())}`;
    void log('out', 'texto').then(() => setText(''));
  };
  const sendMail = () => {
    if (!text.trim()) return;
    if (!client.email) return notify('Ajoute le courriel du client.', 'err');
    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(s.companyName)}&body=${encodeURIComponent(text.trim())}`;
    void log('out', 'courriel').then(() => setText(''));
  };
  const write = async () => {
    const intent = text.trim();
    if (!intent) return notify('Écris en quelques mots ce que tu veux dire (ex.: « dis-lui que j’arrive jeudi matin »).', 'err');
    setBusy(true);
    try {
      const { aiWrite } = await import('../lib/ai');
      const history = msgs.filter((m) => m.dir !== 'note').map((m) => `${m.dir === 'in' ? first : me || 'Moi'}: ${m.text}`);
      setText(await aiWrite({ company: s.companyName, owner: s.ownerName, client: client.contact || client.name, channel: client.phone ? 'texto' : 'courriel', intent, history, model: s.aiModel || undefined }));
    } catch (e) {
      const { aiErrorMessage } = await import('../lib/ai');
      notify(aiErrorMessage(e).replace(' J’utilise l’assistant de base.', ' Choisis un modèle ci-dessous.') || errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card thread">
      <div className="card-head">
        <div><h2 style={{ marginBottom: 2 }}>Conversation</h2><div className="small muted">Textos, courriels, appels et notes avec {first}</div></div>
        {client.phone && <a className="btn small" href={`tel:${client.phone}`} onClick={() => void log('out', 'appel', 'Appel')}><Phone size={15} /> Appeler</a>}
      </div>
      <div className="th-list">
        {msgs.length === 0 && <div className="small muted th-empty">Aucun échange encore. Ce que tu envoies d’ici est gardé, et tu peux noter les réponses du client.</div>}
        {msgs.map((m) => {
          const Icon = m.dir === 'in' && m.channel === 'appel' ? PhoneIncoming : CH_ICON[m.channel];
          return (
            <div key={m.id} className={`th-msg ${m.dir}`}>
              <div className="th-meta"><Icon size={12} /> {m.dir === 'in' ? first : m.dir === 'note' ? 'Note interne' : m.author || 'Moi'} · {CH_LABEL[m.channel]} · {when(m.at)}
                <button className="th-del" onClick={() => void db.messages.delete(m.id!)} aria-label="Effacer"><Trash2 size={12} /></button>
              </div>
              <div className="th-bubble">{m.text}</div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="th-tpl">
        {templates(first, me, s.companyName).map((t) => <button key={t.label} className="chip-btn" onClick={() => setText(t.text)}>{t.label}</button>)}
      </div>
      <textarea className="th-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Écrire à ${first}… ou dis en quelques mots ce que tu veux et touche « Rédiger »`} />
      <div className="th-actions">
        <button className="btn" disabled={busy} onClick={() => void write()}><Sparkles size={16} /> {busy ? 'Rédaction…' : 'Rédiger'}</button>
        <span className="spacer" />
        <button className="btn icon-btn" title="Note interne (pas envoyée)" aria-label="Note interne" disabled={!text.trim()} onClick={() => void log('note', 'note').then(() => setText(''))}><StickyNote size={16} /></button>
        <button className="btn icon-btn" title="Noter la réponse du client" aria-label="Réponse du client" disabled={!text.trim()} onClick={() => void log('in', client.phone ? 'texto' : 'courriel').then(() => setText(''))}><Plus size={16} /></button>
        {client.email && <button className="btn" disabled={!text.trim()} onClick={sendMail}><Mail size={16} /> Courriel</button>}
        <button className="btn accent" disabled={!text.trim()} onClick={sendSms}><MessageSquare size={16} /> Texto</button>
      </div>
    </div>
  );
}
