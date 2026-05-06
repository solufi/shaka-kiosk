'use client';

import { useState } from 'react';
import { Delete, ArrowUp, Space } from 'lucide-react';

interface VirtualKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  /** Show only email-relevant keys (letters, digits, @ . _ -) */
  emailMode?: boolean;
}

const ROW1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
const SYMBOLS = ['@', '.', '_', '-', '+'];

export function VirtualKeyboard({
  value,
  onChange,
  emailMode = false,
}: VirtualKeyboardProps) {
  const [shift, setShift] = useState(false);

  const press = (key: string) => {
    const ch = shift ? key.toUpperCase() : key;
    onChange(value + ch);
    if (shift) setShift(false);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const space = () => onChange(value + ' ');
  const toggleShift = () => setShift((s) => !s);

  const keyClass =
    'flex h-14 min-w-[3rem] flex-1 items-center justify-center rounded-lg bg-slate-700 text-xl font-semibold text-white shadow-md transition active:scale-95 active:bg-slate-600 hover:bg-slate-600 select-none';
  const wideKeyClass = keyClass + ' min-w-[5rem] flex-[1.5]';

  const renderKey = (k: string) => (
    <button
      key={k}
      type="button"
      onClick={() => press(k)}
      className={keyClass}
    >
      {shift ? k.toUpperCase() : k}
    </button>
  );

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-slate-800 p-3 shadow-2xl">
      <div className="flex gap-2">{ROW1.map(renderKey)}</div>
      <div className="flex gap-2">{ROW2.map(renderKey)}</div>
      <div className="flex gap-2 px-6">{ROW3.map(renderKey)}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleShift}
          className={`${wideKeyClass} ${shift ? 'bg-orange-500 hover:bg-orange-400' : ''}`}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
        {ROW4.map(renderKey)}
        <button
          type="button"
          onClick={backspace}
          className={wideKeyClass}
          aria-label="Effacer"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>
      <div className="flex gap-2">
        {SYMBOLS.map(renderKey)}
        {!emailMode && (
          <button
            type="button"
            onClick={space}
            className={`${keyClass} flex-[3]`}
            aria-label="Espace"
          >
            <Space className="h-5 w-5" />
          </button>
        )}
        {emailMode && (
          <button
            type="button"
            onClick={() => onChange(value + '.com')}
            className={`${keyClass} flex-[2] text-base`}
          >
            .com
          </button>
        )}
        {emailMode && (
          <button
            type="button"
            onClick={() => onChange(value + '.ca')}
            className={`${keyClass} flex-1 text-base`}
          >
            .ca
          </button>
        )}
      </div>
    </div>
  );
}
