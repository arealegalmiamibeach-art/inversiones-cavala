import Link from "next/link";
import { CalendarClock, Gavel, LayoutGrid } from "lucide-react";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { BuscadorGlobal } from "./buscador-global";
import { MATERIAS_CATALOGO, materiaInfo, SLUG_TODAS } from "@/lib/procesos/materias";
import { resumirMateria, resumirPorMateria, type ResumenMateria } from "@/lib/procesos/resumen";
import { CrearRegistro } from "@/components/ui/crear-registro";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarOpcionesColumna } from "@/lib/opciones-columna";
import { cargarEventosPorProcesos } from "@/lib/procesos/eventos";
import { MotionList, MotionItem } from "@/components/ui/motion-list";

export default async function ProcesosPage() {
  const supabase = await createClient();

  // Se traen las 222 filas de una sola vez: los conteos por materia, el
  // porcentaje en curso y las diligencias del próximo mes se calculan en
  // memoria (no hay agregados en la base y `eventos` está vacía).
  const [{ data: procesos, error }, opcionesMateria] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("procesos")
        .select("id, materia, expediente, asunto, estado, diligencia, descripcion")
        .order("materia")
        .order("expediente")
        .order("id")
        .range(from, to)
    ),
    cargarOpcionesColumna(supabase, "procesos"),
  ]);
  if (error) throw new Error("No se pudieron cargar los procesos");
  const etiquetasMateria = Object.fromEntries((opcionesMateria.materia ?? []).map((opcion) => [opcion.valor, opcion.etiqueta]));

  const filas = procesos ?? [];
  const eventosPorProceso = await cargarEventosPorProcesos(supabase, filas.map((p) => p.id));
  const resumenes = resumirPorMateria(filas, undefined, eventosPorProceso);
  const porMateria = new Map(resumenes.map((resumen) => [resumen.materia, resumen]));

  // Orden del catálogo primero; al final, cualquier materia inesperada de la data.
  const ordenCatalogo = MATERIAS_CATALOGO.map((materia) => materia.clave);
  const tarjetas = [
    ...ordenCatalogo
      .map((clave) => porMateria.get(clave))
      .filter((resumen): resumen is ResumenMateria => resumen !== undefined),
    ...resumenes.filter((resumen) => !ordenCatalogo.includes(resumen.materia)),
  ];

  const global = resumirMateria(filas, undefined, eventosPorProceso);

  return (
    <div className="flex h-full flex-col">
      <Header title="Procesos Judiciales" />
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/90">Procesos por materia</p>
            <p className="mt-1 text-xs leading-5 text-white/60">
              {global.total.toLocaleString("es-PE")} procesos en {tarjetas.length} materias ·{" "}
              {global.porcentajeEnCurso}% en curso ·{" "}
              {global.diligenciasProximoMes} diligencia{global.diligenciasProximoMes === 1 ? "" : "s"} en los próximos 30 días.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/procesos/materia/${SLUG_TODAS}`} className="glass-btn-secondary px-3 py-2 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" /> Ver todos los procesos
            </Link>
            <CrearRegistro clave="procesos" />
          </div>
        </div>

        <BuscadorGlobal procesos={filas.map(({ id, materia, expediente, asunto }) => ({ id, materia, expediente, asunto }))} />

        {tarjetas.length === 0 ? (
          <div className="glass-empty">
            <Gavel className="mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm font-medium text-white/50">Sin procesos registrados</p>
          </div>
        ) : (
          <MotionList className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tarjetas.map((resumen) => {
              const info = materiaInfo(resumen.materia, etiquetasMateria);
              const Icono = info.icono;
              const urgencia = resumen.criticos > 0 ? "critica" : resumen.proximos > 0 ? "proxima" : null;
              return (
                <MotionItem key={resumen.materia}>
                <Link
                  href={`/procesos/materia/${encodeURIComponent(info.slug)}`}
                  className="glass-card group flex min-h-[176px] flex-col justify-between p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${info.color.borde} ${info.color.fondo} ${info.color.texto}`}>
                      <Icono className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      {urgencia && (
                        <span
                          title={urgencia === "critica" ? `${resumen.criticos} proceso(s) con diligencia vencida o en 7 días` : `${resumen.proximos} proceso(s) con diligencia en 30 días`}
                          className={`h-2.5 w-2.5 rounded-full ${urgencia === "critica" ? "bg-red-400" : "bg-amber-400"} ${urgencia === "critica" ? "animate-pulse" : ""}`}
                        />
                      )}
                      <span className="text-2xl font-semibold tabular-nums text-white">{resumen.total.toLocaleString("es-PE")}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <h2 className="text-sm font-semibold text-white/95 group-hover:text-brand-200">{info.etiqueta}</h2>
                    <div className="mt-2 flex items-baseline gap-1 text-[11px] text-white/70">
                      <span className="font-semibold tabular-nums text-white/90">{resumen.enCurso}</span>
                      <span className="text-white/40">/{resumen.total}</span>
                      <span>en curso</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${info.color.punto}`} style={{ width: `${resumen.porcentajeEnCurso}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[10px] tabular-nums text-white/45">{resumen.porcentajeEnCurso}% en curso</div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-white/60">
                      <CalendarClock className={`h-3 w-3 ${resumen.diligenciasProximoMes > 0 ? "text-amber-300" : "text-white/30"}`} />
                      <span>
                        {resumen.diligenciasProximoMes === 0
                          ? "Sin diligencias en 30 días"
                          : `${resumen.diligenciasProximoMes} diligencia${resumen.diligenciasProximoMes === 1 ? "" : "s"} en 30 días`}
                      </span>
                    </div>
                  </div>
                </Link>
                </MotionItem>
              );
            })}
          </MotionList>
        )}
      </div>
    </div>
  );
}
