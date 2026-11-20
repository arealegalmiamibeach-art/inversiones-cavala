"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { nivelAlerta, type Alerta, type OrigenAlerta } from "@/lib/alertas";
import { fechaCortaCierre } from "@/lib/vencimientos/cierres";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import {
  BotonReabrirVencimiento,
  ChipCierre,
  FormularioCierreVencimiento,
  autoriaCierre,
} from "@/components/ui/cierre-vencimiento";

const GRUPOS_ALERTA: { tipo: string; label: string }[] = [
  { tipo: "Contrato", label: "Contratos" },
  { tipo: "SOAT", label: "SOAT" },
  { tipo: "Póliza", label: "Pólizas" },
  { tipo: "Revisión técnica", label: "Revisiones técnicas" },
  { tipo: "Personal", label: "Contratos de personal" },
];

/** Grupos fijos primero; lo que se marca como vencimiento en "Fechas y avisos" va después, con su propio nombre. */
function gruposAlerta(alertas: Alerta[]): { tipo: string; label: string }[] {
  const fijos = new Set(GRUPOS_ALERTA.map((g) => g.tipo));
  const extra = Array.from(new Set(alertas.map((a) => a.tipo).filter((t) => !fijos.has(t))))
    .sort((a, b) => a.localeCompare(b, "es-PE"))
    .map((tipo) => ({ tipo, label: tipo }));
  return [...GRUPOS_ALERTA, ...extra];
}

const TIPO_DOT: Record<string, string> = {
  Contrato: "bg-brand-400",
  SOAT: "bg-amber-400",
  Póliza: "bg-violet-400",
  "Revisión técnica": "bg-sky-400",
  Personal: "bg-emerald-400",
};

/**
 * Vencimientos del dashboard. Cada fila se puede cerrar ("Registrar qué
 * pasó"): lo cerrado sale de la lista, la campana y el correo, y queda abajo
 * en "Cerrados" por si hay que reabrirlo.
 *
 * `editables`: orígenes que el rol puede cerrar. Las fechas de propiedades
 * personalizadas pueden ser de cualquier entidad, así que las decide el
 * servidor al guardar.
 */
export function VencimientosWidget({
  alertas,
  editables,
}: {
  alertas: Alerta[];
  editables: OrigenAlerta[];
}) {
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);
  const puedeCerrar = (a: Alerta) => a.origen === "propiedad" || editables.includes(a.origen);

  const pendientes = alertas.filter((a) => !a.cierre);
  const cerrados = alertas.filter((a) => a.cierre);

  // Lo ya vencido va aparte y arriba: antes la ventana empezaba en hoy, así
  // que un contrato o un SOAT vencía y desaparecía del panel al día siguiente.
  const vencidos = pendientes.filter((a) => a.vencido);
  const proximos = pendientes.filter((a) => !a.vencido);

  const grupos = gruposAlerta(proximos)
    .map((g) => ({ ...g, alertas: proximos.filter((a) => a.tipo === g.tipo) }))
    .filter((g) => g.alertas.length > 0);

  const fila = (a: Alerta) => (
    <AlertaRow
      key={a.id}
      alerta={a}
      puedeCerrar={puedeCerrar(a)}
      cerrando={abiertoId === a.id}
      onAlternar={() => setAbiertoId((actual) => (actual === a.id ? null : a.id))}
    />
  );

  return (
    <div className="space-y-4">
      {pendientes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <CalendarClock className="mb-3 h-9 w-9 text-white/15" />
          <p className="text-sm text-white/40">
            {cerrados.length > 0 ? "Todos los vencimientos están atendidos." : "Sin vencimientos en los próximos 60 días."}
          </p>
        </div>
      )}
      {vencidos.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-300/80">
            Ya vencidos <span className="tabular-nums text-red-300/50">({vencidos.length})</span>
          </p>
          <ul className="scrollbar-glass divide-y divide-white/5 overflow-hidden rounded-lg border border-red-400/25 bg-red-500/[0.06]">
            {vencidos.map(fila)}
          </ul>
        </div>
      )}
      {grupos.map((g) => (
        <div key={g.tipo}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">
            {g.label} <span className="tabular-nums text-white/25">({g.alertas.length})</span>
          </p>
          <ul className="scrollbar-glass divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
            {g.alertas.map(fila)}
          </ul>
        </div>
      ))}
      {cerrados.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerCerrados((v) => !v)}
            className="-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            <TrianguloDesplegable abierto={verCerrados} />
            Cerrados <span className="tabular-nums text-white/25">({cerrados.length})</span>
          </button>
          {verCerrados && (
            <ul className="mt-1.5 divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.015]">
              {cerrados.map((a) => (
                <CerradoRow key={a.id} alerta={a} puedeReabrir={puedeCerrar(a)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FechaYDias({ alerta }: { alerta: Alerta }) {
  const nivel = nivelAlerta(alerta.dias);
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span className="text-xs tabular-nums text-white/45">{fechaCortaCierre(alerta.fecha)}</span>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums",
          nivel === "critico" ? "text-red-300" : nivel === "proximo" ? "text-amber-300" : "text-white/45"
        )}
      >
        {alerta.dias === 0 ? "Hoy" : alerta.dias === 1 ? "Mañana" : `${alerta.dias}d`}
      </span>
    </div>
  );
}

function AlertaRow({
  alerta,
  puedeCerrar,
  cerrando,
  onAlternar,
}: {
  alerta: Alerta;
  puedeCerrar: boolean;
  cerrando: boolean;
  onAlternar: () => void;
}) {
  return (
    <li>
      <div className="group flex items-center pr-2 transition-colors hover:bg-white/5">
        <Link
          href={alerta.href}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TIPO_DOT[alerta.tipo] ?? "bg-white/40")} />
            <span className="truncate text-sm font-medium text-white/90">{alerta.nombre}</span>
          </div>
          <FechaYDias alerta={alerta} />
        </Link>
        {puedeCerrar && (
          <button
            type="button"
            onClick={onAlternar}
            title="Registrar qué pasó con este vencimiento"
            aria-expanded={cerrando}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors focus-visible:opacity-100",
              alerta.vencido || cerrando
                ? "bg-red-500/15 text-red-200 hover:bg-red-500/30 hover:text-white"
                : "text-white/50 opacity-0 hover:bg-white/15 hover:text-white group-hover:opacity-100",
              cerrando && "opacity-100"
            )}
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">Registrar qué pasó</span>
          </button>
        )}
      </div>
      {cerrando && (
        <FormularioCierreVencimiento
          alertaId={alerta.id}
          fecha={alerta.fecha}
          onListo={onAlternar}
          onCancelar={onAlternar}
          className="mx-3 mb-2.5"
        />
      )}
    </li>
  );
}

function CerradoRow({ alerta, puedeReabrir }: { alerta: Alerta; puedeReabrir: boolean }) {
  const cierre = alerta.cierre!;
  return (
    <li className="px-3 py-2 transition-colors hover:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={alerta.href}
          className="flex min-w-0 items-center gap-2 text-white/60 transition-colors hover:text-white/90"
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full opacity-50", TIPO_DOT[alerta.tipo] ?? "bg-white/40")} />
          <span className="truncate text-sm">{alerta.nombre}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-white/35">{fechaCortaCierre(alerta.fecha)}</span>
          <ChipCierre cierre={cierre} />
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-3.5 text-[11px] text-white/40">
        {cierre.nota && <span className="text-white/55">{cierre.nota}</span>}
        <span>{autoriaCierre(cierre)}</span>
        {puedeReabrir && <BotonReabrirVencimiento alertaId={alerta.id} fecha={alerta.fecha} className="ml-auto" />}
      </div>
    </li>
  );
}
