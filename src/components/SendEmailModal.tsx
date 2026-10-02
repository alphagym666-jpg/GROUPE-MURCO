import { useState } from 'react';
import { Link } from 'react-router-dom';
import { connectGmail, isGmailConnected, mailtoLink, sendEmail, type Attachment } from '../lib/gmail';
import { useSettings } from '../lib/hooks';
import { downloadBlob } from '../lib/utils';
import { Modal } from './Modal';
import { errMsg, useToast } from './Toast';

interface Props {
  title?: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  onClose: () => void;
  onSent: (info: { gmailId?: string; to: string; subject: string }) => void | Promise<void>;
}

export function SendEmailModal(p: Props) {
  const s = useSettings();
  const notify = useToast();
  const [to, setTo] = useState(p.to);
  const [cc, setCc] = useState(p.cc ?? '');
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.body);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(isGmailConnected());

  const connect = async () => {
    try {
      await connectGmail(s.googleClientId);
      setConnected(true);
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  const send = async () => {
    if (!to.trim()) return notify('Ajoute une adresse courriel.', 'err');
    setBusy(true);
    try {
      const id = await sendEmail({ to, cc: cc || undefined, subject, body, attachments: p.attachments });
      await p.onSent({ gmailId: id, to, subject });
      notify('Courriel envoyé par Gmail ✔');
      p.onClose();
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const fallback = async () => {
    p.attachments.forEach((a) => downloadBlob(a.blob, a.filename));
    window.location.href = mailtoLink(to, subject, body + '\n\n(Pièce jointe téléchargée — glisse-la dans le courriel.)');
    await p.onSent({ to, subject });
  };

  const size = p.attachments.reduce((a, b) => a + b.blob.size, 0);

  return (
    <Modal title={p.title ?? 'Envoyer par courriel'} onClose={p.onClose}>
      {!connected && (
        <div className="notice info">
          {s.googleClientId ? (
            <>
              Connecte ton Gmail pour envoyer directement avec la pièce jointe.{' '}
              <button className="btn small primary" onClick={connect}>Connecter Gmail</button>
            </>
          ) : (
            <>
              Gmail n’est pas encore configuré (<Link to="/parametres" onClick={p.onClose}>Paramètres → Gmail</Link>). Tu peux quand
              même utiliser « Ouvrir dans ma messagerie ».
            </>
          )}
        </div>
      )}
      <div className="grid" style={{ gap: 10 }}>
        <label className="field">À<input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field">Cc<input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optionnel" /></label>
        <label className="field">Objet<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="field">Message<textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        {p.attachments.length > 0 && (
          <div className="small muted">
            📎 {p.attachments.map((a) => a.filename).join(', ')} ({(size / 1024 / 1024).toFixed(2)} Mo)
            {size > 24 * 1024 * 1024 && <div className="notice err">Plus de 25 Mo: Gmail risque de refuser. Réduis la période ou retire les photos.</div>}
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={fallback}>Ouvrir dans ma messagerie</button>
        <button className="btn accent" onClick={send} disabled={!connected || busy}>{busy ? 'Envoi…' : 'Envoyer avec Gmail'}</button>
      </div>
    </Modal>
  );
}
