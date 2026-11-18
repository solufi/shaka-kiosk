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
    pending(result.message || 'Remboursement en cours. Présentez la même carte au lecteur.');
    await pause();
  } while (now() < deadline);
  throw new Error('Remboursement non confirmé. Veuillez contacter le service client.');
}
