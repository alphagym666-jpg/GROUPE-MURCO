import { haptic } from '../lib/feel';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

interface ToastAction {
  label: string;
  run: () => void;
}
type Notify = (msg: string, kind?: 'ok' | 'err', action?: ToastAction) => void;
type Confirm = (o: { title: string; message?: string; confirm?: string; danger?: boolean }) => Promise<boolean>;

const Ctx = createContext<Notify>(() => undefined);
const ConfirmCtx = createContext<Confirm>(async () => false);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err'; key: number; action?: ToastAction } | null>(null);
  const [ask, setAsk] = useState<(Parameters<Confirm>[0] & { resolve: (v: boolean) => void }) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback<Notify>((msg, kind = 'ok', action) => {
    const key = Date.now();
    setToast({ msg, kind, key, action });
    haptic(kind === 'err' ? 'error' : 'light');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast((t) => (t?.key === key ? null : t)), action ? 6500 : kind === 'err' ? 6000 : 3000);
  }, []);

  const confirm = useCallback<Confirm>((o) => new Promise((resolve) => setAsk({ ...o, resolve })), []);
  const answer = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  return (
    <Ctx.Provider value={notify}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {toast && (
          <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} role="status">
            <span>{toast.msg}</span>
            {toast.action && (
              <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>
            )}
          </div>
        )}
        {ask && (
          <Modal title={ask.title} onClose={() => answer(false)}>
            {ask.message && <p style={{ marginTop: 0 }}>{ask.message}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => answer(false)}>Annuler</button>
              <button className={`btn ${ask.danger ? 'danger' : 'accent'}`} autoFocus onClick={() => answer(true)}>{ask.confirm ?? 'Confirmer'}</button>
            </div>
          </Modal>
        )}
      </ConfirmCtx.Provider>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
/** Demande une confirmation dans l'app (remplace confirm() du navigateur). */
export const useConfirm = () => useContext(ConfirmCtx);

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
