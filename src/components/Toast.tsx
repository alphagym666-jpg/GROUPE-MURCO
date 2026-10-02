import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Notify = (msg: string, kind?: 'ok' | 'err') => void;
const Ctx = createContext<Notify>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err'; key: number } | null>(null);
  const notify = useCallback<Notify>((msg, kind = 'ok') => {
    const key = Date.now();
    setToast({ msg, kind, key });
    setTimeout(() => setToast((t) => (t?.key === key ? null : t)), kind === 'err' ? 6000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} onClick={() => setToast(null)}>{toast.msg}</div>}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
