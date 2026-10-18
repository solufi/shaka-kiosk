'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_DISPLAY, DisplayLayout, validateDisplay } from '@/lib/display-layout';
export function useDisplayLayout(busy: boolean, catalogVisible: boolean) {
  const [applied, setApplied] = useState<{ revision: string; config: DisplayLayout } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch('/api/local-display', { cache: 'no-store' });
        const { published } = await response.json();
        if (!cancelled && !busy && response.ok && published?.revision) {
          const config = validateDisplay(published.config);
          setApplied(current => current?.revision === published.revision ? current : { revision: published.revision, config });
        }
      } catch { /* Keep the last valid presentation during a local outage. */ }
    };
    void poll(); const timer = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [busy]);
  useEffect(() => {
    if (!applied || !catalogVisible || busy) return;
    const acknowledge = () => { void fetch('/api/local-display', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: applied.revision }) }).catch(() => {}); };
    // Run after React commits the catalogue, not when the configuration merely arrives.
    const frame = requestAnimationFrame(acknowledge);
    const timer = setInterval(acknowledge, 15000);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); };
  }, [applied, catalogVisible, busy]);
  return applied?.config ?? DEFAULT_DISPLAY;
}
