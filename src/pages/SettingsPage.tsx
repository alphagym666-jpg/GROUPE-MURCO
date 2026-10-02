import { useEffect, useRef, useState } from 'react';
import { errMsg, useToast } from '../components/Toast';
import { getSettings, saveSettings, type Settings } from '../lib/db';
import { buildBackup, restoreBackup } from '../lib/exportZip';
import { geocode } from '../lib/geo';
import { connectGmail, isGmailConnected } from '../lib/gmail';
import { downloadBlob, todayISO } from '../lib/utils';

async function logoToPng(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export default function SettingsPage() {
  const notify = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [homeCheck, setHomeCheck] = useState('');
  const restoreRef = useRef<HTMLInputElement>(null);
  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return null;

  const up = (p: Partial<Settings>) => setS({ ...s, ...p });
  const txt = (k: keyof Settings, label: string, opts: { full?: boolean; type?: string; placeholder?: string } = {}) => (
    <label className={`field ${opts.full ? 'full' : ''}`}>
      {label}
      <input type={opts.type ?? 'text'} value={String(s[k] ?? '')} placeholder={opts.placeholder}
        onChange={(e) => up({ [k]: opts.type === 'number' ? Number(e.target.value) : e.target.value } as Partial<Settings>)} />
    </label>
  );

  const save = async () => {
    const before = await getSettings();
    const patch = { ...s };
    if (patch.homeAddress !== before.homeAddress) patch.homeGeo = undefined;
    await saveSettings(patch);
    setS(patch);
    notify('Paramètres enregistrés ✔');
  };

  const checkHome = async () => {
    setHomeCheck('Recherche…');
    try {
      const r = await geocode(s.homeAddress);
      if (!r) return setHomeCheck('❌ Adresse introuvable — ajoute la ville et le code postal.');
      up({ homeGeo: r.geo });
      await saveSettings({ homeAddress: s.homeAddress, homeGeo: r.geo });
      setHomeCheck(`✅ Trouvée: ${r.label}`);
    } catch (e) {
      setHomeCheck(`❌ ${errMsg(e)}`);
    }
  };

  const origin = window.location.origin;

  return (
    <>
      <div className="page-head">
        <h1>Paramètres</h1>
        <button className="btn accent" onClick={save}>💾 Enregistrer</button>
      </div>

      <div className="card">
        <h2>🏢 Ma compagnie (apparaît sur les factures et soumissions)</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          {s.logo ? <img src={s.logo} alt="Logo" style={{ maxHeight: 60, maxWidth: 200 }} /> : <span className="muted small">Aucun logo</span>}
          <label className="btn small">
            Choisir le logo
            <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) up({ logo: await logoToPng(f) }); }} />
          </label>
          {s.logo && <button className="btn small danger" onClick={() => up({ logo: undefined })}>Retirer</button>}
        </div>
        <div className="form-grid">
          {txt('companyName', 'Nom affiché')}
          {txt('legalName', 'Raison sociale')}
          {txt('address', 'Adresse', { full: true })}
          {txt('city', 'Ville')}
          {txt('province', 'Province')}
          {txt('postalCode', 'Code postal')}
          {txt('phone', 'Téléphone', { type: 'tel' })}
          {txt('email', 'Courriel', { type: 'email' })}
          {txt('website', 'Site web')}
          {txt('neq', 'NEQ')}
          {txt('tpsNumber', 'No TPS', { placeholder: '123456789 RT0001' })}
          {txt('tvqNumber', 'No TVQ', { placeholder: '1234567890 TQ0001' })}
          {txt('rbqNumber', 'Licence RBQ (si applicable)')}
        </div>
      </div>

      <div className="card">
        <h2>🏠 Domicile — point de départ du journal de bord</h2>
        <div className="form-grid">
          <label className="field full">Adresse du domicile
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input value={s.homeAddress} onChange={(e) => up({ homeAddress: e.target.value, homeGeo: undefined })} placeholder="ex.: 45 rue des Érables, Mirabel, QC J7J 1A1" />
              <button className="btn" onClick={checkHome}>Vérifier</button>
            </div>
          </label>
        </div>
        {homeCheck && <div className="small" style={{ marginTop: 6 }}>{homeCheck}</div>}
        <div className="form-grid" style={{ marginTop: 12 }}>
          {txt('vehicle', 'Véhicule (marque, modèle, année)')}
          {txt('kmRateFirst5000', 'Taux $/km (5 000 premiers)', { type: 'number' })}
          {txt('kmRateAfter5000', 'Taux $/km (après 5 000)', { type: 'number' })}
        </div>
        <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={s.autoTripFromInvoices} onChange={(e) => up({ autoTripFromInvoices: e.target.checked })} /> Ajouter automatiquement le trajet au journal de bord pour chaque facture</label>
        <label className="check"><input type="checkbox" checked={s.autoTripRoundTrip} onChange={(e) => up({ autoTripRoundTrip: e.target.checked })} /> Compter l’aller-retour</label>
      </div>

      <div className="card">
        <h2>🧾 Taxes, numérotation et textes</h2>
        <div className="form-grid">
          {txt('tpsRate', 'TPS %', { type: 'number' })}
          {txt('tvqRate', 'TVQ %', { type: 'number' })}
          {txt('invoicePrefix', 'Préfixe factures')}
          {txt('nextInvoiceNumber', 'Prochain no de facture', { type: 'number' })}
          {txt('quotePrefix', 'Préfixe soumissions')}
          {txt('nextQuoteNumber', 'Prochain no de soumission', { type: 'number' })}
          {txt('paymentTermsDays', 'Délai de paiement (jours)', { type: 'number' })}
          {txt('quoteValidityDays', 'Validité soumission (jours)', { type: 'number' })}
          <label className="field full">Notes par défaut — factures<textarea value={s.invoiceNotes} onChange={(e) => up({ invoiceNotes: e.target.value })} /></label>
          <label className="field full">Notes par défaut — soumissions<textarea value={s.quoteNotes} onChange={(e) => up({ quoteNotes: e.target.value })} /></label>
          <label className="field full">Instructions de paiement<textarea value={s.paymentInstructions} onChange={(e) => up({ paymentInstructions: e.target.value })} /></label>
          <label className="field full">Signature des courriels<textarea value={s.emailSignature} onChange={(e) => up({ emailSignature: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <h2>✉️ Gmail</h2>
        <div className="form-grid">
          {txt('googleClientId', 'ID client OAuth Google', { full: true, placeholder: 'xxxxxxxx.apps.googleusercontent.com' })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!s.googleClientId} onClick={async () => {
            try { await saveSettings({ googleClientId: s.googleClientId }); await connectGmail(s.googleClientId); notify('Gmail connecté ✔'); } catch (e) { notify(errMsg(e), 'err'); }
          }}>Tester la connexion</button>
          <span className="small muted">{isGmailConnected() ? '🟢 Connecté' : '⚪ Non connecté'}</span>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary><strong>Comment obtenir l’ID client (une seule fois, ~10 min)</strong></summary>
          <ol className="small" style={{ lineHeight: 1.6 }}>
            <li>Va sur <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a> avec ton compte Gmail et crée un projet « Murco ».</li>
            <li>Menu <em>API et services → Bibliothèque</em>: active <strong>Gmail API</strong>.</li>
            <li><em>API et services → Écran de consentement OAuth</em>: type « Externe », nom « Murco », ton courriel. Dans « Utilisateurs test », ajoute ton adresse Gmail.</li>
            <li><em>Identifiants → Créer des identifiants → ID client OAuth</em> → type <strong>Application Web</strong>.</li>
            <li>Dans « Origines JavaScript autorisées », ajoute: <code>{origin}</code></li>
            <li>Copie l’« ID client » (finit par <code>.apps.googleusercontent.com</code>) et colle-le ci-dessus.</li>
          </ol>
        </details>
      </div>

      <div className="card">
        <h2>📦 Comptable</h2>
        <div className="form-grid">
          {txt('accountantName', 'Nom du comptable')}
          {txt('accountantEmail', 'Courriel du comptable', { type: 'email' })}
        </div>
      </div>

      <div className="card">
        <h2>💾 Sauvegarde</h2>
        <p className="small muted">Tes données sont gardées sur cet appareil. Fais une sauvegarde régulièrement (ou pour transférer vers ton téléphone/ordinateur).</p>
        <div className="row">
          <button className="btn" onClick={async () => downloadBlob(await buildBackup(), `Murco_sauvegarde_${todayISO()}.zip`)}>⬇ Télécharger une sauvegarde</button>
          <button className="btn" onClick={() => restoreRef.current?.click()}>⬆ Restaurer</button>
          <input ref={restoreRef} type="file" accept=".zip" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f || !confirm('Remplacer TOUTES les données actuelles par cette sauvegarde?')) return;
            try { await restoreBackup(f); notify('Sauvegarde restaurée'); setS(await getSettings()); } catch (err) { notify(errMsg(err), 'err'); }
          }} />
        </div>
      </div>

      <div className="card">
        <h2>📱 Installer sur ton téléphone</h2>
        <ul className="small" style={{ lineHeight: 1.6 }}>
          <li><strong>iPhone</strong>: ouvre le lien dans Safari → bouton Partager → « Sur l’écran d’accueil ».</li>
          <li><strong>Android</strong>: ouvre dans Chrome → menu ⋮ → « Installer l’application ».</li>
        </ul>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn accent" onClick={save}>💾 Enregistrer</button></div>
    </>
  );
}
