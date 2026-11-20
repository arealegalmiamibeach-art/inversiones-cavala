interface Segment {
  label: string;
  value: number;
  color: string;
}

export function EntityDonut({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const ordered = [...segments].sort((a, b) => b.value - a.value);

  let cumulative = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative shrink-0">
        <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
          {total > 0 &&
            ordered.map((s) => {
              const fraction = s.value / total;
              const length = fraction * circumference;
              const dashoffset = -cumulative;
              cumulative += length;
              if (length === 0) return null;
              return (
                <circle
                  key={s.label}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashoffset}
                >
                  {/* un solo nodo de texto: interpolar varias expresiones aquí
                      rompe la hidratación dentro de <title> de SVG */}
                  <title>{`${s.label}: ${s.value} (${Math.round(fraction * 100)}%)`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-white">{total.toLocaleString("es-PE")}</span>
          <span className="text-[10px] uppercase tracking-wide text-white/35">Registros</span>
        </div>
      </div>

      <ul className="w-full flex-1 space-y-2">
        {ordered.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate text-white/65">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-white">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
