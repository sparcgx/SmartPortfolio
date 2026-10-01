import type { Instrument } from './instrument-history';

export default function InstrumentLink({ instrument, onOpen, className = '' }: {
  instrument: Instrument & { name: string };
  onOpen: (instrument: Instrument) => void;
  className?: string;
}) {
  return <button type="button" onClick={() => onOpen(instrument)}
    aria-label={`查看 ${instrument.name} ${instrument.symbol}（${instrument.category}）交易明細`}
    className={`min-h-11 max-w-full rounded-md py-1 text-left text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${className}`}>
    <span className="block break-words font-semibold">{instrument.name}</span>
    <span className="block font-mono text-sm">{instrument.symbol}</span>
  </button>;
}
