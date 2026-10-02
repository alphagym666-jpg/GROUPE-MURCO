import { Copy, Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { reminderText, smsLink } from '../lib/agenda';
import { db, type Client, type Job } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { Modal } from './Modal';
import { SendEmailModal } from './SendEmailModal';
import { useToast } from './Toast';

/** Rappel au client avant le passage (texto ou courriel). */
export function ReminderModal({ job, client, onClose }: { job: Job; client?: Client; onClose: () => void }) {
  const s = useSettings();
  const notify = useToast();
  const [text, setText] = useState(() => reminderText(job, client, s.companyName, s.phone, s.ownerName.split(' ')[0] || s.companyName));
  const [mail, setMail] = useState(false);
  const mark = () => db.jobs.update(job.id!, { remindedAt: new Date().toISOString() });

  if (mail)
    return (
      <SendEmailModal
        title="Rappel par courriel"
        to={client?.email ?? ''}
        subject={`Rappel — passage de ${s.companyName}`}
        body={text}
        attachments={[]}
        onClose={onClose}
        onSent={async ({ gmailId, to, subject }) => {
          await mark();
          await db.emails.add({ date: new Date().toISOString(), to, subject, clientId: job.clientId, gmailId, kind: 'autre' });
        }}
      />
    );

  return (
    <Modal title={`Rappel à ${client?.name ?? 'client'}`} onClose={onClose}>
      <label className="field">Message
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            notify('Message copié');
          } catch {
            notify('Copie impossible: sélectionne le texte.', 'err');
          }
        }}><Copy size={16} /> Copier</button>
        <button className="btn" disabled={!client?.email} onClick={() => setMail(true)}><Mail size={16} /> Courriel</button>
        {client?.phone ? (
          <a className="btn accent" href={smsLink(client.phone, text)} onClick={() => { void mark(); setTimeout(onClose, 300); }}><MessageSquare size={16} /> Texto</a>
        ) : (
          <button className="btn accent" disabled title="Ajoute un numéro de téléphone au client"><MessageSquare size={16} /> Texto</button>
        )}
      </div>
      {client?.phone && <div className="small muted" style={{ marginTop: 8 }}>Téléphone: {client.phone}</div>}
    </Modal>
  );
}
