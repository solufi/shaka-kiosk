'use client';

import { useState } from 'react';
import { Tag, Check, X, Loader2 } from 'lucide-react';
import { VirtualKeyboard } from './virtual-keyboard';

const FLEET_URL =
  process.env.NEXT_PUBLIC_FLEET_URL || 'https://fleet.shakadistribution.ca';

export interface AppliedPromo {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number; // percent (0-100) or cents
  promoId: string;
  // Code family. 'corporate' codes are subsidized by an employer: the
  // discount equals the employer's share and a CorporateUsage row must be
  // recorded at vend time so the company is invoiced.
  kind: 'promo' | 'corporate';
  // Corporate-only metadata
  subsidyPercent?: number;
  companyName?: string;
  employeeName?: string;
}

interface PromoInputProps {
  machineId: string;
  /** Currently applied promo (null = none) */
  applied: AppliedPromo | null;
  onApply: (promo: AppliedPromo) => void;
  onRemove: () => void;
  /** Disable input (e.g. during payment) */
  disabled?: boolean;
}

export function PromoInput({
  machineId,
  applied,
  onApply,
  onRemove,
  disabled = false,
}: PromoInputProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`${FLEET_URL}/api/promo-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean, machineId, redeem: false }),
      });
      const data = await res.json();
      if (data.ok && data.valid) {
        if (data.kind === 'corporate') {
          // Corporate code: the discount is the employer's subsidy share.
          // The validate-only response has no `code` field, so reuse the
          // entered code (needed later to record the redemption).
          const pct = Number(data.subsidyPercent ?? data.discountValue ?? 0);
          onApply({
            code: clean,
            discountType: 'percent',
            discountValue: pct,
            promoId: '',
            kind: 'corporate',
            subsidyPercent: pct,
            companyName: data.companyName,
            employeeName: data.employeeName,
          });
        } else {
          // Standard promo. The server uses "percentage" | "fixed"; normalize
          // to the local 'percent' | 'fixed' shape.
          onApply({
            code: data.code,
            discountType: data.discountType === 'percentage' ? 'percent' : 'fixed',
            discountValue: data.discountValue,
            promoId: data.promoId,
            kind: 'promo',
          });
        }
        setOpen(false);
        setCode('');
      } else {
        setError(data.error || 'Code invalide');
      }
    } catch {
      setError('Impossible de joindre le serveur');
    } finally {
      setValidating(false);
    }
  };

  if (applied) {
    const label =
      applied.discountType === 'percent'
        ? `-${applied.discountValue}%`
        : `-$${(applied.discountValue / 100).toFixed(2)}`;
    return (
      <div className="flex w-full items-center justify-between rounded-lg border-2 border-green-500/40 bg-green-500/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-500" />
          <span className="font-mono font-semibold">{applied.code}</span>
          {applied.kind === 'corporate' && applied.companyName && (
            <span className="text-muted-foreground">· {applied.companyName}</span>
          )}
          <span className="text-green-600 font-bold">
            {applied.kind === 'corporate' && applied.discountValue >= 100
              ? 'Gratuit'
              : label}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive transition disabled:opacity-50"
          aria-label="Retirer le code promo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <Tag className="h-4 w-4" />
        Ajouter un code promo
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-6 w-6 text-orange-400" />
              <h3 className="text-2xl font-bold">Code promo</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCode('');
                setError(null);
              }}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="rounded-xl border-2 border-slate-700 bg-slate-950 p-4">
            <p className="text-3xl font-mono font-bold tracking-widest text-center min-h-[2.5rem]">
              {code || <span className="text-slate-600">CODE</span>}
            </p>
          </div>
          {error && (
            <p className="text-center text-red-400 font-medium">{error}</p>
          )}
          <VirtualKeyboard value={code} onChange={(v) => setCode(v.toUpperCase())} />
          <button
            type="button"
            onClick={validate}
            disabled={!code.trim() || validating}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-orange-500 bg-orange-600 py-4 text-lg font-semibold transition hover:bg-orange-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {validating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Validation...
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Appliquer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
