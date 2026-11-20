"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { cerrarVencimiento, reabrirVencimiento } from "@/lib/actions/vencimientos";
import { cn } from "@/lib/utils";
import {
  NOTA_CIERRE_MAX,
  RESULTADO_CIERRE_LABEL,
  fechaCortaCierre,
  resultadosParaAlerta,
  type CierreVencimiento,
  type ResultadoCierre,
} from "@/lib/vencimientos/cierres";

/**
 * "Registrar qué pasó" con un vencimiento (contrato, SOAT, póliza…). Mismo
 * lenguaje visual que el cierre de diligencias: chips de resultado + nota.
 * Se usa en el widget de vencimientos, el calendario y la ficha del contrato.
 */

export const CLASES_RESULTADO: Record<ResultadoCierre, string> = {
  RENOVADO: "bg-emerald-500/15 text-emerald-300",
  PRORROGADO: "bg-sky-500/15 text-sky-300",
  CONCLUIDO: "bg-white/[0.08] text-white/70",
  RESUELTO: "bg-amber-500/15 text-amber-300",
  OTRO: "bg-violet-500/15 text-violet-300",
};

export function FormularioCierreVencimiento({
  alertaId,
  fecha,
  onListo,
  onCancelar,
  className,
}: {
  alertaId: string;
  fecha: string;
  /** Después de guardar (la página ya se está refrescando). */
  onListo?: () => void;
  onCancelar: () => void;
  className?: string;
}) {
  const router = useRouter();
  const opciones = resultadosParaAlerta(alertaId);
  const [resultado, setResultado] = useState<ResultadoCierre>(opciones[0]);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const faltaNota = resultado === "OTRO" && !nota.trim();

  function guardar() {
    setError(null);
    iniciar(async () => {
      const res = await cerrarVencimiento({ alertaId, fecha, resultado, nota: nota.trim() || null });
      if (!res.ok) { setError(res.error); return; }
      onListo?.();
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-2 rounded-lg border border-white/[0.1] bg-white/[0.03] p-2.5", className)}>
      <div className="flex flex-wrap gap-1">
        {opciones.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setResultado(opcion)}
            className={cn(
              "rounded px-2 py-1 text-[10px] font-medium transition-colors",
              resultado === opcion ? CLASES_RESULTADO[opcion] : "text-white/45 hover:bg-white/[0.08] hover:text-white/80"
            )}
          >
            {RESULTADO_CIERRE_LABEL[opcion]}
          </button>
        ))}
      </div>
      <input
        value={nota}
        maxLength={NOTA_CIERRE_MAX}
        onChange={(e) => setNota(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !faltaNota && !pendiente) guardar();
        }}
        placeholder={resultado === "OTRO" ? "Qué pasó (obligatorio)" : "Qué pasó (opcional): motivo, nuevo contrato, adenda…"}
        className="view-control h-8"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pendiente || faltaNota}
          onClick={guardar}
          className="glass-btn-primary px-2.5 py-1 text-[10px] disabled:opacity-50"
        >
          {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Cerrar vencimiento
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

/** Chip con el resultado: "Se renovó". */
export function ChipCierre({ cierre, className }: { cierre: Pick<CierreVencimiento, "resultado">; className?: string }) {
  return (
    <span className={cn("rounded px-1.5 text-[9px] font-medium uppercase", CLASES_RESULTADO[cierre.resultado], className)}>
      {RESULTADO_CIERRE_LABEL[cierre.resultado]}
    </span>
  );
}

/** "por Ana · 29 set." — quién y cuándo lo cerró. */
export function autoriaCierre(cierre: CierreVencimiento): string {
  // Con zona fija: el servidor (UTC) y el navegador deben pintar el mismo día.
  const cuando = new Date(cierre.cerradoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" });
  return cierre.cerradoPorNombre ? `${cierre.cerradoPorNombre} · ${cuando}` : cuando;
}

export function BotonReabrirVencimiento({
  alertaId,
  fecha,
  onListo,
  className,
}: {
  alertaId: string;
  fecha: string;
  onListo?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          setError(null);
          iniciar(async () => {
            const res = await reabrirVencimiento({ alertaId, fecha });
            if (!res.ok) { setError(res.error); return; }
            onListo?.();
            router.refresh();
          });
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/85 disabled:opacity-40",
          className
        )}
      >
        {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        Reabrir
      </button>
      {error && <span className="text-[10px] text-red-300">{error}</span>}
    </>
  );
}

/**
 * Franja de vencimiento en la ficha: abierta, avisa y ofrece "Registrar qué
 * pasó"; cerrada, muestra el resultado con la opción de reabrir.
 */
export function FranjaVencimiento({
  alertaId,
  fecha,
  cierre,
  puedeCerrar,
  urgente,
  children,
}: {
  alertaId: string;
  fecha: string;
  cierre: CierreVencimiento | null;
  puedeCerrar: boolean;
  urgente: boolean;
  /** El aviso: "Contrato vencido el …". */
  children: React.ReactNode;
}) {
  const [cerrando, setCerrando] = useState(false);

  if (cierre) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
        <Check className="h-4 w-4 shrink-0 text-white/40" />
        <span>Vencimiento del {fechaCortaCierre(fecha)} cerrado:</span>
        <ChipCierre cierre={cierre} className="text-[10px]" />
        {cierre.nota && <span className="text-white/75">{cierre.nota}</span>}
        <span className="text-xs text-white/35">· {autoriaCierre(cierre)}</span>
        {puedeCerrar && <BotonReabrirVencimiento alertaId={alertaId} fecha={fecha} className="ml-auto" />}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm",
          urgente ? "border-red-400/25 bg-red-500/10 text-red-300" : "border-amber-400/25 bg-amber-500/10 text-amber-300"
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{children}</span>
        {puedeCerrar && !cerrando && (
          <button
            type="button"
            onClick={() => setCerrando(true)}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85 transition-colors hover:bg-white/20 hover:text-white"
          >
            <Check className="h-3.5 w-3.5" /> Registrar qué pasó
          </button>
        )}
      </div>
      {cerrando && (
        <FormularioCierreVencimiento
          alertaId={alertaId}
          fecha={fecha}
          onListo={() => setCerrando(false)}
          onCancelar={() => setCerrando(false)}
          className="mt-2 max-w-xl"
        />
      )}
    </div>
  );
}
