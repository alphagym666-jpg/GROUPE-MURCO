import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | undefined;
  onChange: (n: number) => void;
};

const parse = (t: string) => {
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const show = (n: number | undefined) => (n ? String(n).replace('.', ',') : '');

/**
 * Champ de nombre pensé pour le cellulaire: vide plutôt que « 0 », tout est sélectionné quand on touche
 * (on tape par-dessus), et la virgule fonctionne (clavier français).
 */
export function NumInput({ value, onChange, placeholder = '0', onFocus, ...rest }: Props) {
  const [txt, setTxt] = useState(show(value));
  const editing = useRef(false);
  const fresh = useRef(false);

  // Valeur changée ailleurs (code de service, calculateur…): on l'affiche
  useEffect(() => {
    if (!editing.current || parse(txt) !== (value || 0)) setTxt(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={txt}
      onFocus={(e) => {
        editing.current = true;
        fresh.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      // Le doigt (ou la souris) qui se relève place le curseur et défait la sélection: on la refait
      onMouseUp={(e) => {
        if (fresh.current) {
          e.preventDefault();
          e.currentTarget.select();
        }
      }}
      onClick={(e) => {
        if (fresh.current) e.currentTarget.select();
        fresh.current = false;
      }}
      onKeyDown={() => {
        fresh.current = false;
      }}
      onBlur={() => {
        editing.current = false;
        setTxt(show(value));
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,\s-]/g, '');
        setTxt(t);
        onChange(parse(t));
      }}
    />
  );
}
