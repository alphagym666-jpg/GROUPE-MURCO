import { useState } from 'react';
import { db, type Client } from '../lib/db';
import { AddressInput } from './AddressInput';
import { Modal } from './Modal';
import { errMsg, useToast } from './Toast';

export function emptyClient(): Client {
  return { name: '', contact: '', email: '', phone: '', address: '', notes: '', createdAt: new Date().toISOString() };
}

export function ClientFormModal({ initial, onClose, onSaved }: { initial?: Client; onClose: () => void; onSaved?: (id: number) => void }) {
  const notify = useToast();
  const [c, setC] = useState<Client>(initial ?? emptyClient());
  const set = (k: keyof Client, v: string) => setC((x) => ({ ...x, [k]: v, ...(k === 'address' ? { geo: undefined } : {}) }));

  const save = async () => {
    if (!c.name.trim()) return notify('Le nom du client est requis.', 'err');
    try {
      const id = await db.clients.put(c);
      notify('Client enregistré');
      onSaved?.(id);
      onClose();
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  return (
    <Modal title={c.id ? 'Modifier le client' : 'Nouveau client'} onClose={onClose}>
      <div className="form-grid">
        <label className="field full">Nom / Compagnie *<input autoFocus value={c.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="field">Personne contact<input value={c.contact} onChange={(e) => set('contact', e.target.value)} /></label>
        <label className="field">Téléphone<input type="tel" value={c.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="field full">Courriel<input type="email" value={c.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="field full">Adresse (rue, ville, code postal)
          <AddressInput value={c.address} onChange={(v) => set('address', v)} onPick={(label, geo) => setC((x) => ({ ...x, address: label, geo }))} />
        </label>
        <label className="field">Langue des documents
          <select value={c.lang ?? 'fr'} onChange={(e) => setC((x) => ({ ...x, lang: e.target.value as 'fr' | 'en' }))}>
            <option value="fr">Français</option>
            <option value="en">English (anglais)</option>
          </select>
        </label>
        <label className="field full">Notes<textarea value={c.notes} onChange={(e) => set('notes', e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn accent" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
