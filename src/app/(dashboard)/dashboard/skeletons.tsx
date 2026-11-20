// Fallbacks de Suspense para las tres secciones del dashboard.
// Sin "use client" — son puramente declarativos.

export function StatsSkeletons() {
  return (
    <div>
      <div className="mb-3 h-3 w-28 animate-pulse rounded bg-white/[0.08]" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-panel animate-pulse p-5">
            <div className="h-11 w-11 rounded-xl bg-white/[0.08]" />
            <div className="mt-4 h-7 w-14 rounded bg-white/[0.08]" />
            <div className="mt-2 h-3.5 w-20 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarioSkeleton() {
  return (
    <div className="glass-panel animate-pulse p-4 sm:p-5">
      {/* Cabecera del calendario */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-36 rounded bg-white/[0.08]" />
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/[0.08]" />
          <div className="h-8 w-24 rounded-lg bg-white/[0.08]" />
          <div className="h-8 w-8 rounded-lg bg-white/[0.08]" />
        </div>
      </div>
      {/* Nombres de días */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-6 rounded bg-white/[0.05]" />
        ))}
      </div>
      {/* Celdas del mes */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

export function VencimientosSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Vencimientos */}
      <div className="glass-panel animate-pulse p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-white/[0.08]" />
          <div className="h-4 w-52 rounded bg-white/[0.08]" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/[0.12]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-white/[0.08]" />
                <div className="h-2.5 w-1/2 rounded bg-white/[0.05]" />
              </div>
              <div className="h-5 w-16 rounded-full bg-white/[0.08]" />
            </div>
          ))}
        </div>
      </div>
      {/* Distribución */}
      <div className="glass-panel animate-pulse p-5">
        <div className="mb-4 h-4 w-40 rounded bg-white/[0.08]" />
        <div className="mx-auto h-40 w-40 rounded-full bg-white/[0.04] ring-[16px] ring-white/[0.03]" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/[0.10]" />
              <div className="h-2.5 flex-1 rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
