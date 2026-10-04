import { useState } from 'react';
import { smsLink } from '../lib/agenda';
import { db, type Client, type Doc } from '../lib/db';
import { makeDocPdf } from '../lib/docPdf';
import { useSettings } from '../lib/hooks';
import { docFileName } from '../lib/pdf';
import { docTotals, formatDate, money } from '../lib/utils';
import { Modal } from './Modal';
import { SendEmailModal } from './SendEmailModal';
import { useToast } from './Toast';

/** Relancer un client pour une facture impayée (ou une soumission sans réponse): texto ou courriel avec le PDF. */
export function RelanceModal({ doc, client, onClose }: { doc: Doc; client?: Client; onClose: () => void }) {
  const s = useSettings();
  const notify = useToast();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const first = s.ownerName.split(' ')[0] || s.companyName;
  const who = client?.contact || client?.name || '';
  const text = doc.type === 'invoice'
    ? `Bonjour ${who}, petit rappel: la facture ${doc.number} de ${money(docTotals(doc, s).balance)} était payable le ${formatDate(doc.dueDate)}. ${s.paymentInstructions} Merci! ${first}`
    : `Bonjour ${who}, je fais un suivi pour la soumission ${doc.number}${doc.title ? ` (${doc.title})` : ''}. Avez-vous des questions? Je peux vous céduler rapidement. ${first} — ${s.phone}`;
  const kind = doc.type === 'invoice' ? 'facture' : 'soumission';

  if (pdf) {
    return (
      <SendEmailModal
        title={`Relance — ${doc.number}`}
        to={client?.email ?? ''}
        subject={doc.type === 'invoice' ? `Rappel — facture ${doc.number} (${s.companyName})` : `Suivi — soumission ${doc.number} (${s.companyName})`}
        body={text}
        attachments={[{ filename: docFileName(doc, client), mimeType: 'application/pdf', blob: pdf }]}
        onClose={onClose}
        onSent={async ({ gmailId, to, subject }) => {
          await db.emails.add({ date: new Date().toISOString(), to, subject, clientId: doc.clientId, docId: doc.id, gmailId, kind });
          notify('Relance envoyée');
        }}
      />
    );
  }
  return (
    <Modal title={`Relancer — ${doc.number}`} onClose={onClose}>
      <p style={{ marginTop: 0 }}>{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {client?.phone && <a className="btn" href={smsLink(client.phone, text)} onClick={() => setTimeout(onClose, 300)}>Texto</a>}
        <button className="btn accent" onClick={async () => setPdf(await makeDocPdf(doc, client, s))}>Courriel avec la {kind}</button>
      </div>
    </Modal>
  );
}
