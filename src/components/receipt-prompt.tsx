'use client';

import { useState } from 'react';
import { Mail, X, CheckCircle2, Loader2, Send } from 'lucide-react';
import { VirtualKeyboard } from './virtual-keyboard';

interface ReceiptPromptProps {
  /** Vend API base URL (e.g. http://127.0.0.1:5001) */
  vendApiBase: string;
  /** Called when the prompt is dismissed (either skipped or after sending) */
  onDone: () => void;
}

type Phase = 'choice' | 'enter_email' | 'sending' | 'sent' | 'error';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function ReceiptPrompt({ vendApiBase, onDone }: ReceiptPromptProps) {
  const [phase, setPhase] = useState<Phase>('choice');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendReceipt = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setErrorMsg('Adresse courriel invalide');
      return;
    }
    setErrorMsg(null);
    setPhase('sending');
    try {
      const res = await fetch(`${vendApiBase}/receipt/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (data.ok) {
        setPhase('sent');
        setTimeout(onDone, 2500);
      } else {
        setErrorMsg(data.error || 'Échec de l\'envoi');
        setPhase('error');
      }
    } catch {
      setErrorMsg('Impossible de contacter le serveur');
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 p-8 shadow-2xl">
        {phase === 'choice' && (
          <div className="flex flex-col items-center gap-6 text-white">
            <Mail className="h-20 w-20 text-blue-400" />
            <h2 className="text-3xl font-bold">Voulez-vous un reçu ?</h2>
            <p className="text-lg text-white/70 text-center">
              Recevez le détail de votre transaction par courriel
            </p>
            <div className="mt-4 grid w-full grid-cols-2 gap-4">
              <button
                type="button"
                onClick={onDone}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-600 bg-slate-800 px-8 py-6 text-xl font-semibold transition hover:bg-slate-700 active:scale-95"
              >
                <X className="h-8 w-8 text-slate-400" />
                Non merci
              </button>
              <button
                type="button"
                onClick={() => setPhase('enter_email')}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-blue-500 bg-blue-600 px-8 py-6 text-xl font-semibold transition hover:bg-blue-500 active:scale-95"
              >
                <Mail className="h-8 w-8" />
                Oui, par courriel
              </button>
            </div>
          </div>
        )}

        {phase === 'enter_email' && (
          <div className="flex flex-col gap-4 text-white">
            <h2 className="text-2xl font-bold text-center">Votre adresse courriel</h2>
            <div className="rounded-xl border-2 border-slate-700 bg-slate-950 p-4">
              <p className="text-2xl font-mono break-all min-h-[2rem]">
                {email || <span className="text-slate-500">exemple@email.com</span>}
              </p>
            </div>
            {errorMsg && (
              <p className="text-center text-red-400 font-medium">{errorMsg}</p>
            )}
            <VirtualKeyboard value={email} onChange={setEmail} emailMode />
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={onDone}
                className="flex-1 rounded-2xl border-2 border-slate-600 bg-slate-800 py-4 text-lg font-semibold transition hover:bg-slate-700 active:scale-95"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={sendReceipt}
                disabled={!isValidEmail(email)}
                className="flex flex-[2] items-center justify-center gap-2 rounded-2xl border-2 border-blue-500 bg-blue-600 py-4 text-lg font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                Envoyer le reçu
              </button>
            </div>
          </div>
        )}

        {phase === 'sending' && (
          <div className="flex flex-col items-center gap-4 py-8 text-white">
            <Loader2 className="h-16 w-16 animate-spin text-blue-400" />
            <p className="text-2xl font-semibold">Envoi du reçu...</p>
          </div>
        )}

        {phase === 'sent' && (
          <div className="flex flex-col items-center gap-4 py-8 text-white">
            <CheckCircle2 className="h-20 w-20 text-green-400" />
            <p className="text-2xl font-bold text-green-400">Reçu envoyé !</p>
            <p className="text-lg text-white/70">à {email}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8 text-white">
            <X className="h-20 w-20 text-red-500" />
            <p className="text-2xl font-bold text-red-400">Échec de l'envoi</p>
            {errorMsg && <p className="text-white/70 text-center">{errorMsg}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onDone}
                className="rounded-2xl border-2 border-slate-600 bg-slate-800 px-6 py-3 text-lg font-semibold transition hover:bg-slate-700"
              >
                Continuer
              </button>
              <button
                type="button"
                onClick={() => setPhase('enter_email')}
                className="rounded-2xl border-2 border-blue-500 bg-blue-600 px-6 py-3 text-lg font-semibold transition hover:bg-blue-500"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
