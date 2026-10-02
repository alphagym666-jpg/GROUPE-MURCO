import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/db';
import { suggestAddresses, type AddressSuggestion } from '../lib/geo';

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Appelé quand une suggestion Google Maps est choisie (adresse exacte + coordonnées). */
  onPick?: (label: string, geo: GeoPoint) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Champ d'adresse avec suggestions Google Maps (si une clé est configurée). */
export function AddressInput({ value, onChange, onPick, placeholder, autoFocus }: Props) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!typed.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await suggestAddresses(value);
        setItems(r);
        setOpen(r.length > 0);
      } catch {
        setItems([]);
      }
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  const pick = async (s: AddressSuggestion) => {
    setOpen(false);
    typed.current = false;
    onChange(s.label);
    try {
      const r = await s.resolve();
      if (r) onPick?.(s.label, r.geo);
    } catch {
      /* l'adresse sera géocodée plus tard */
    }
  };

  return (
    <div className="addr" onBlur={() => setTimeout(() => setOpen(false), 200)}>
      <input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => items.length && setOpen(true)}
      />
      {open && (
        <div className="addr-list" role="listbox">
          {items.map((s) => (
            <button type="button" key={s.label} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
              📍 {s.label}
            </button>
          ))}
          <div className="addr-by">Google Maps</div>
        </div>
      )}
    </div>
  );
}
