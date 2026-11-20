import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Briefcase,
  CarFront,
  CircleCheck,
  Clock3,
  HardHat,
  Handshake,
  Layers,
  ScrollText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { getAcceso } from "@/lib/auth/perfil";
import { tiposContratoVisibles } from "@/lib/auth/roles";
import { calcularVigencia } from "@/lib/contratos/vigencia";
import { leerMarcaAdenda } from "@/lib/contratos/adendas";
import { cargarOpcionesColumna } from "@/lib/opciones-columna";
import { etiquetaFamilia, FAMILIA_DESCRIPCION, ORDEN_TIPOS } from "./opciones";
import { CrearRegistro } from "@/components/ui/crear-registro";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { MotionList, MotionItem } from "@/components/ui/motion-list";

const ICONOS: Record<string, LucideIcon> = {
  personal: UsersRound,
  profesional: Briefcase,
  servicios: Handshake,
  mutuo: ScrollText,
  arrendamiento: CarFront,
  concesiones: HardHat,
};

type FilaResumen = {
  tipo: string | null;
  monto: number | null;
  moneda: string | null;
  fecha_vencimiento: string | null;
  extra: Record<string, unknown> | null;
};

type Resumen = {
  tipo: string;
  total: number;
  adendas: number;
  vigentes: number;
  porVencer: number;
  vencidos: number;
  montos: Record<string, number>;
};

/** Índice de contratos: una tarjeta por familia, como el índice de Notion. */
export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; estado?: string; vencimiento?: string; vencidos?: string }>;
}) {
  const sp = await searchParams;

  // Enlaces y marcadores de la lista anterior (`/contratos?tipo=…&estado=…`)
  // siguen funcionando: se resuelven contra la ruta de la familia.
  const tieneFiltrosHeredados = sp.q !== undefined || sp.estado !== undefined || sp.vencimiento !== undefined || sp.vencidos !== undefined;
  if (sp.tipo || tieneFiltrosHeredados) {
    const familia = sp.tipo && (ORDEN_TIPOS as readonly string[]).includes(sp.tipo) ? sp.tipo : "todos";
    redirect(`/contratos/tipo/${familia}`);
  }

  const supabase = await createClient();
  const [{ data, error }, rol, opcionesTipo] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("contratos")
        .select("tipo, monto, moneda, fecha_vencimiento, extra")
        .order("tipo")
        .order("id")
        .range(from, to)
    ),
    getAcceso(),
    cargarOpcionesColumna(supabase, "contratos"),
  ]);
  if (error) throw new Error("No se pudieron cargar los contratos");

  // Etiquetas de Tipo: las del catálogo editable en cuanto alguien las
  // renombra desde "Editar propiedad"; mientras tanto, las del código.
  const etiquetasTipo = Object.fromEntries((opcionesTipo.tipo ?? []).map((opcion) => [opcion.valor, opcion.etiqueta]));
  const etiquetaTipo = (tipo: string) => etiquetasTipo[tipo] ?? etiquetaFamilia(tipo);

  const permitidos = tiposContratoVisibles(rol);
  const resumenes = new Map<string, Resumen>();

  function resumenDe(tipo: string) {
    let resumen = resumenes.get(tipo);
    if (!resumen) {
      resumen = { tipo, total: 0, adendas: 0, vigentes: 0, porVencer: 0, vencidos: 0, montos: {} };
      resumenes.set(tipo, resumen);
    }
    return resumen;
  }

  for (const tipo of ORDEN_TIPOS) {
    if (!permitidos || permitidos.includes(tipo)) resumenDe(tipo);
  }

  for (const fila of (data ?? []) as FilaResumen[]) {
    const tipo = fila.tipo?.trim();
    if (!tipo) continue;
    if (permitidos && !permitidos.includes(tipo)) continue;
    const resumen = resumenDe(tipo);

    // Las adendas cuelgan de su contrato: se cuentan aparte para no inflar el total.
    if (leerMarcaAdenda(fila.extra).esAdenda) {
      resumen.adendas += 1;
      continue;
    }

    resumen.total += 1;
    const { estado, dias } = calcularVigencia(fila.fecha_vencimiento);
    if (estado === "vencido") resumen.vencidos += 1;
    else if (estado === "vigente") {
      if (dias !== null && dias <= 30) resumen.porVencer += 1;
      else resumen.vigentes += 1;
    }
    if (fila.monto) {
      const moneda = fila.moneda === "USD" ? "USD" : "PEN";
      resumen.montos[moneda] = (resumen.montos[moneda] ?? 0) + Number(fila.monto);
    }
  }

  const orden = new Map(ORDEN_TIPOS.map((tipo, indice) => [tipo as string, indice]));
  const familias = Array.from(resumenes.values()).sort(
    (a, b) => (orden.get(a.tipo) ?? 99) - (orden.get(b.tipo) ?? 99) || a.tipo.localeCompare(b.tipo, "es-PE")
  );

  const totalContratos = familias.reduce((suma, familia) => suma + familia.total, 0);
  const totalVencidos = familias.reduce((suma, familia) => suma + familia.vencidos, 0);
  const totalPorVencer = familias.reduce((suma, familia) => suma + familia.porVencer, 0);
  const conRegistros = familias.filter((familia) => familia.total > 0).length;

  return (
    <div className="flex h-full flex-col">
      <Header title="Contratos" />
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/90">Contratos de Inversiones Cavala</p>
            <p className="mt-1 text-xs leading-5 text-white/60">
              {totalContratos.toLocaleString("es-PE")} contratos en {conRegistros} de {familias.length} familias.
              {totalVencidos > 0 && <> · <span className="text-amber-300">{totalVencidos} vencidos</span></>}
              {totalPorVencer > 0 && <> · <span className="text-amber-300">{totalPorVencer} vencen en 30 días</span></>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/contratos/tipo/todos" className="glass-btn-secondary px-3 py-2 text-xs">
              <Layers className="h-3.5 w-3.5" /> Ver todos
            </Link>
            <CrearRegistro clave="contratos" />
          </div>
        </div>

        <MotionList className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {familias.map((familia) => {
            const Icon = ICONOS[familia.tipo] ?? ScrollText;
            const vacia = familia.total === 0;
            return (
              <MotionItem key={familia.tipo}>
              <Link
                href={`/contratos/tipo/${familia.tipo}`}
                className={`glass-card group flex min-h-[168px] flex-col justify-between p-4 ${vacia ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/15 text-brand-300 transition-colors group-hover:border-brand-300/40 group-hover:bg-brand-500/20">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums text-white">{familia.total.toLocaleString("es-PE")}</span>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-white/95 group-hover:text-brand-200">{etiquetaTipo(familia.tipo)}</h2>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/50">
                    {FAMILIA_DESCRIPCION[familia.tipo] ?? "Contratos de esta familia."}
                  </p>

                  {vacia ? (
                    <p className="mt-2 text-[10px] text-white/45">Sin contratos registrados todavía.</p>
                  ) : (
                    <>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                        <Semaforo icono={<CircleCheck className="h-3 w-3" />} valor={familia.vigentes} label="vigentes" tono="text-emerald-300" />
                        <Semaforo icono={<Clock3 className="h-3 w-3" />} valor={familia.porVencer} label="por vencer" tono="text-amber-300" />
                        <Semaforo icono={<AlertTriangle className="h-3 w-3" />} valor={familia.vencidos} label="vencidos" tono="text-red-300" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-white/55">
                        {Object.entries(familia.montos).length === 0
                          ? <span>Sin montos registrados</span>
                          : Object.entries(familia.montos).map(([moneda, monto]) => (
                              <span key={moneda} className="font-mono">
                                {moneda === "USD" ? "$ " : "S/ "}
                                {monto.toLocaleString("es-PE", { maximumFractionDigits: 0 })}
                              </span>
                            ))}
                        {familia.adendas > 0 && <span>· {familia.adendas} adendas</span>}
                      </div>
                    </>
                  )}
                </div>
              </Link>
              </MotionItem>
            );
          })}
        </MotionList>
      </div>
    </div>
  );
}

function Semaforo({ icono, valor, label, tono }: { icono: React.ReactNode; valor: number; label: string; tono: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${valor > 0 ? tono : "text-white/35"}`}>
      {icono}
      <span className="tabular-nums font-semibold">{valor}</span>
      <span className="text-white/45">{label}</span>
    </span>
  );
}
