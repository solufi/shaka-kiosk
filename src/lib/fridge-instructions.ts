export function fridgeInstructions(phase?: string): string {
  if (phase === 'unlocking') return 'Ouvrez la porte du frigo dès le déclic.';
  if (phase === 'awaiting_open') return 'Ouvrez la porte du frigo et prenez vos articles.';
  if (phase === 'awaiting_close') return 'Refermez la porte du frigo pour terminer.';
  return 'Prenez vos articles dans le frigo, puis refermez la porte.';
}
