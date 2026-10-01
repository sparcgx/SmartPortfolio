import { useEffect, useRef, useState } from 'react';
import { instrumentFromHash, instrumentHash, type Instrument } from './instrument-history';

export function useInstrumentPage() {
  const [instrument, setInstrument] = useState<Instrument | null>(() =>
    typeof window === 'undefined' ? null : instrumentFromHash(window.location.hash));
  const origin = useRef<{ scroll: number; element: HTMLElement | null } | null>(null);
  const previous = useRef(instrument);

  useEffect(() => {
    const sync = () => setInstrument(instrumentFromHash(window.location.hash));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  useEffect(() => {
    const wasOpen = previous.current !== null;
    previous.current = instrument;
    const frame = window.requestAnimationFrame(() => {
      if (instrument) window.scrollTo({ top: 0, behavior: 'instant' });
      else if (wasOpen && origin.current) {
        window.scrollTo({ top: origin.current.scroll, behavior: 'instant' });
        if (origin.current.element?.isConnected) origin.current.element.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [instrument]);

  const openInstrument = (target: Instrument) => {
    origin.current = { scroll: window.scrollY, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    window.history.pushState({ smartportfolioInstrument: true }, '', instrumentHash(target));
    setInstrument(instrumentFromHash(window.location.hash));
  };
  const clearInstrument = () => {
    if (!instrument) return;
    origin.current = null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setInstrument(null);
  };
  const backFromInstrument = () => {
    if (window.history.state?.smartportfolioInstrument) window.history.back();
    else clearInstrument();
  };
  return { instrument, openInstrument, clearInstrument, backFromInstrument };
}
