type RefundDetails = {
  refund_amount?: number;
  is_interac?: boolean;
  refund_card_presented?: boolean;
  settlement_complete?: boolean;
  reader_location?: string;
};

export function refundMessage(refund?: RefundDetails): string {
  const cents = refund?.refund_amount;
  if (!refund || typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents <= 0) return '';
  const dollars = (cents / 100).toFixed(2);
  const fr = dollars.replace('.', ',') + ' $';
  const en = '$' + dollars;
  if (refund.settlement_complete) {
    return `Remboursement de ${fr} confirmé.\nRefund of ${en} confirmed.`;
  }
  if (refund.is_interac && !refund.refund_card_presented) {
    const left = /\bgauche\b/i.test(refund.reader_location || '');
    const lecteur = left ? 'au lecteur de la machine de gauche' : 'au lecteur';
    const reader = left ? 'at the reader on the machine to your left' : 'at the card reader';
    return `Pour recevoir votre remboursement de ${fr}, présentez de nouveau la carte utilisée pour cet achat ${lecteur}.\nTo receive your ${en} refund, present the card you used for this purchase again ${reader}.`;
  }
  return `Remboursement de ${fr} en cours. Veuillez patienter.\nYour ${en} refund is being processed. Please wait.`;
}

/** Keep the customer at the reader until the agent confirms the final bank amount. */
export async function settlePayment(
  base: string, sessionId: string, pending: (message:string)=>void,
  fetcher: typeof fetch = fetch, now: ()=>number = Date.now,
  pause: ()=>Promise<void> = ()=>new Promise(resolve=>setTimeout(resolve,1000)),
) {
  if (!sessionId) throw new Error('Session de paiement inconnue');
  const deadline = now() + 190000;
  do {
    const response = await fetcher(`${base}/stripe/vend-result`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sessionId}),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Paiement à vérifier');
    if (!result.pending) {
      if (!result.session?.settlement_complete) throw new Error('Règlement non confirmé');
      return result;
    }
    pending(refundMessage(result.session) || result.message || 'Règlement en cours. / Processing payment.');
    await pause();
  } while (now() < deadline);
  throw new Error('Remboursement non confirmé. Veuillez contacter le service client.');
}
