import { createClient } from "@/lib/supabase/server";
import { BotonImprimir } from "./boton-imprimir";
import {
  MATERIAS,
  MATERIA_COLOR,
  agruparPorEstado,
  agruparPorMateria,
  procesosIncompletos,
  proximaDiligencia,
  resumirDescripcion,
  type ProcesoReporte,
} from "./calculos";
import { esFechaISOValida, fechaCivilDesdeISO, hoyISOEnLima } from "@/lib/utils";
import { getUsuario } from "@/lib/auth/perfil";
import { cargarEventosPorProcesos, proximaDiligenciaRegistrada } from "@/lib/procesos/eventos";

const ESTILOS_IMPRESION = `
@page { size: A4; margin: 16mm 14mm 20mm 14mm; }
@page { @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #6b7280; } }
* { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
@media print {
  body * { visibility: hidden; }
  .reporte-imprimible, .reporte-imprimible * { visibility: visible; }
  .reporte-imprimible { position: absolute; inset: 0; width: auto; box-shadow: none; }
  .reporte-pie-fijo { display: block; }
}
.reporte-pie-fijo { display: none; position: fixed; bottom: 6mm; left: 14mm; right: 14mm; text-align: center; font-size: 8pt; color: #6b7280; }
.reporte-seccion, .reporte-materia, .reporte-tabla tr { break-inside: avoid; }
.reporte-tabla thead { display: table-header-group; }
/* Sin esto, una celda con texto largo sin espacios (un código de expediente,
   por ejemplo) empuja la tabla más allá del ancho de la hoja A4 en vez de
   ajustarse — el reporte se salía de la página. */
.reporte-tabla { table-layout: fixed; }
.reporte-tabla th, .reporte-tabla td { overflow-wrap: anywhere; word-break: break-word; }
`;

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function formatearFecha(fecha: Date | null): string {
  if (!fecha) return "—";
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function ReporteProcesosPage({
  searchParams,
}: {
  searchParams: Promise<{ materia?: string | string[]; estado?: string | string[]; desde?: string | string[]; hasta?: string | string[] }>;
}) {
  const sp = await searchParams;
  const materiaFiltro = primero(sp.materia) || "";
  const estadoFiltro = primero(sp.estado) || "";
  const desdeRaw = primero(sp.desde) || "";
  const hastaRaw = primero(sp.hasta) || "";
  const desde = esFechaISOValida(desdeRaw) ? desdeRaw : "";
  const hasta = esFechaISOValida(hastaRaw) ? hastaRaw : "";

  const supabase = await createClient();

  let query = supabase
    .from("procesos")
    .select("id, materia, expediente, asunto, estado, descripcion, juzgado, abogado, estudio, diligencia")
    .order("materia")
    .order("expediente");
  if (materiaFiltro) query = query.eq("materia", materiaFiltro);
  if (estadoFiltro) query = query.eq("estado", estadoFiltro);
  const [user, { data, error }] = await Promise.all([getUsuario(), query]);
  if (error) throw new Error("No se pudo generar el reporte de procesos");

  let procesos: ProcesoReporte[] = data ?? [];
  const eventosPorProceso = await cargarEventosPorProcesos(supabase, procesos.map((p) => p.id));
  const fechaProxima = (p: ProcesoReporte) => {
    const proxima = proximaDiligenciaRegistrada(p, eventosPorProceso[p.id] ?? []);
    return proxima ? fechaCivilDesdeISO(proxima.fechaISO) : null;
  };

  const hoy = fechaCivilDesdeISO(hoyISOEnLima());

  // `desde`/`hasta` acotan por la fecha de próxima diligencia extraída del
  // texto libre (no hay columna de fecha en `procesos`): sólo tiene sentido
  // filtrar los procesos que sí mencionan una fecha futura dentro del rango.
  if (desde || hasta) {
    const desdeDate = desde ? new Date(`${desde}T00:00:00`) : null;
    const hastaDate = hasta ? new Date(`${hasta}T23:59:59`) : null;
    procesos = procesos.filter((p) => {
      const proxima = fechaProxima(p);
      if (!proxima) return false;
      if (desdeDate && proxima.getTime() < desdeDate.getTime()) return false;
      if (hastaDate && proxima.getTime() > hastaDate.getTime()) return false;
      return true;
    });
  }

  const porMateria = agruparPorMateria(procesos);
  const detallePorMateria = [...porMateria].sort((a, b) => a.label.localeCompare(b.label, "es-PE"));
  const porEstado = agruparPorEstado(procesos);
  const incompletos = procesosIncompletos(procesos);
  const sinExpediente = procesos.filter((p) => !p.expediente?.trim()).length;
  const conDiligenciaProxima30 = procesos.filter((p) => {
    const proxima = fechaProxima(p);
    if (!proxima) return false;
    const dias = Math.ceil((proxima.getTime() - hoy.getTime()) / 86400000);
    return dias >= 0 && dias <= 30;
  }).length;

  const maxMateria = Math.max(1, ...porMateria.map((m) => m.total));

  const filtros: string[] = [];
  if (materiaFiltro) filtros.push(`Materia: ${MATERIAS[materiaFiltro] ?? materiaFiltro}`);
  if (estadoFiltro) filtros.push(`Estado: ${estadoFiltro}`);
  if (desde) filtros.push(`Diligencias desde ${formatearFecha(new Date(`${desde}T00:00:00`))}`);
  if (hasta) filtros.push(`Diligencias hasta ${formatearFecha(new Date(`${hasta}T00:00:00`))}`);
  const filtrosTexto = filtros.length > 0 ? filtros.join(" · ") : "Sin filtros — todos los procesos";

  const fechaEmision = hoy.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#e7e9ee] print:static print:overflow-visible print:bg-white">
      <style>{ESTILOS_IMPRESION}</style>
      <BotonImprimir />

      <div className="reporte-imprimible mx-auto my-10 w-[210mm] max-w-full bg-white text-[#111827] shadow-[0_30px_80px_rgba(0,0,0,.35)] print:my-0 print:w-auto print:shadow-none">
        {/* ── Portada / cabecera ─────────────────────────────────────── */}
        <header className="reporte-seccion border-b-4 border-[#1F3864] px-10 pb-6 pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#1F3864]">Inversiones Cavala S.A.C.</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">Reporte de procesos judiciales</h1>
          <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5 text-[11px] text-[#374151] sm:grid-cols-4">
            <DatoCabecera label="Fecha de emisión" valor={fechaEmision} />
            <DatoCabecera label="Emitido por" valor={user?.email ?? "—"} />
            <DatoCabecera label="Total de procesos" valor={String(procesos.length)} />
            <DatoCabecera label="Materias representadas" valor={String(porMateria.length)} />
            <DatoCabecera label="Filtros aplicados" valor={filtrosTexto} className="col-span-2 sm:col-span-4" />
          </dl>
        </header>

        {/* ── Resumen ejecutivo ──────────────────────────────────────── */}
        <section className="reporte-seccion px-10 py-6">
          <TituloSeccion numero="1" texto="Resumen ejecutivo" />

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TarjetaCifra etiqueta="Procesos incluidos" valor={procesos.length} />
            <TarjetaCifra etiqueta="Diligencia en 30 días" valor={conDiligenciaProxima30} acento="#b45309" />
            <TarjetaCifra etiqueta="Sin expediente asignado" valor={sinExpediente} acento="#b91c1c" />
            <TarjetaCifra etiqueta="Datos incompletos" valor={incompletos.length} acento="#b91c1c" />
          </div>

          <p className="mb-2 mt-6 text-[11px] font-semibold text-[#374151]">Conteo por materia</p>
          <table className="reporte-tabla w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-[#f1f5f9] text-left text-[#374151]">
                <Th>Materia</Th>
                <Th className="text-right">N° procesos</Th>
                <Th className="text-right">% del total</Th>
                <Th className="text-right">% en curso</Th>
              </tr>
            </thead>
            <tbody>
              {porMateria.map((m) => (
                <tr key={m.materia} className="border-b border-[#e5e7eb]">
                  <Td>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: MATERIA_COLOR[m.materia] ?? "#1F3864" }} />
                    {m.label}
                  </Td>
                  <Td className="text-right tabular-nums">{m.total}</Td>
                  <Td className="text-right tabular-nums">{m.pctTotal}%</Td>
                  <Td className="text-right tabular-nums">{m.pctEnCurso}%</Td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mb-2 mt-5 text-[11px] font-semibold text-[#374151]">Conteo por estado</p>
          <table className="reporte-tabla w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-[#f1f5f9] text-left text-[#374151]">
                <Th>Estado</Th>
                <Th className="text-right">N° procesos</Th>
              </tr>
            </thead>
            <tbody>
              {porEstado.map((e) => (
                <tr key={e.estado} className="border-b border-[#e5e7eb]">
                  <Td>{e.estado}</Td>
                  <Td className="text-right tabular-nums">{e.total}</Td>
                </tr>
              ))}
              {porEstado.length === 0 && (
                <tr><Td className="text-[#9ca3af]">Sin registros</Td><Td /></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── Gráfico por materia ────────────────────────────────────── */}
        <section className="reporte-seccion px-10 py-6">
          <TituloSeccion numero="2" texto="Distribución por materia" />
          <div className="mt-4 space-y-2.5">
            {porMateria.map((m) => (
              <div key={m.materia} className="flex items-center gap-3 text-[10.5px]">
                <span className="w-32 shrink-0 truncate text-[#374151]">{m.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-[#f1f5f9]">
                  <div
                    className="h-full rounded"
                    style={{ width: `${Math.max(2, (m.total / maxMateria) * 100)}%`, backgroundColor: MATERIA_COLOR[m.materia] ?? "#1F3864" }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-[#111827]">{m.total}</span>
              </div>
            ))}
            {porMateria.length === 0 && <p className="text-[11px] text-[#9ca3af]">Sin procesos para graficar.</p>}
          </div>
        </section>

        {/* ── Detalle por materia ────────────────────────────────────── */}
        <section className="px-10 py-6">
          <TituloSeccion numero="3" texto="Detalle por materia" />
          <div className="mt-3 space-y-6">
            {detallePorMateria.map((m) => {
              const lista = procesos.filter((p) => p.materia === m.materia);
              return (
                <div key={m.materia} className="reporte-materia">
                  <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#111827]">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MATERIA_COLOR[m.materia] ?? "#1F3864" }} />
                    {m.label}
                    <span className="text-[10px] font-normal text-[#6b7280]">({lista.length})</span>
                  </h3>
                  <table className="reporte-tabla w-full border-collapse text-[9.5px]">
                    <thead>
                      <tr className="bg-[#f1f5f9] text-left text-[#374151]">
                        <Th>Expediente</Th>
                        <Th>Asunto</Th>
                        <Th>Estado</Th>
                        <Th>Descripción</Th>
                        <Th>Juzgado</Th>
                        <Th>Abogado</Th>
                        <Th>Estudio</Th>
                        <Th>Próx. diligencia</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((p) => (
                        <tr key={p.id} className="border-b border-[#e5e7eb] align-top">
                          <Td className="font-mono">{p.expediente ?? "—"}</Td>
                          <Td>{p.asunto ?? "—"}</Td>
                          <Td>{p.estado ?? "—"}</Td>
                          <Td>{resumirDescripcion(p.descripcion)}</Td>
                          <Td>{p.juzgado ?? "—"}</Td>
                          <Td>{p.abogado ?? "—"}</Td>
                          <Td>{p.estudio ?? "—"}</Td>
                          <Td>{formatearFecha(fechaProxima(p))}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {detallePorMateria.length === 0 && <p className="text-[11px] text-[#9ca3af]">No hay procesos que coincidan con los filtros aplicados.</p>}
          </div>
        </section>

        {/* ── Anexo: datos incompletos ───────────────────────────────── */}
        {incompletos.length > 0 && (
          <section className="reporte-seccion px-10 py-6">
            <TituloSeccion numero="4" texto={`Anexo — Procesos con datos incompletos (${incompletos.length})`} />
            <table className="reporte-tabla mt-3 w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-[#f1f5f9] text-left text-[#374151]">
                  <Th>Expediente</Th>
                  <Th>Materia</Th>
                  <Th>Asunto</Th>
                  <Th>Falta</Th>
                </tr>
              </thead>
              <tbody>
                {incompletos.map((p) => {
                  const falta = [
                    !p.expediente?.trim() && "expediente",
                    !p.juzgado?.trim() && "juzgado",
                    !p.abogado?.trim() && "abogado",
                  ].filter(Boolean).join(", ");
                  return (
                    <tr key={p.id} className="border-b border-[#e5e7eb] align-top">
                      <Td className="font-mono">{p.expediente ?? "—"}</Td>
                      <Td>{MATERIAS[p.materia] ?? p.materia}</Td>
                      <Td>{p.asunto ?? "—"}</Td>
                      <Td className="capitalize text-[#b91c1c]">{falta}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Pie (visible en pantalla al final de la hoja) ──────────── */}
        <footer className="reporte-seccion border-t border-[#e5e7eb] px-10 py-4 text-center text-[9px] text-[#9ca3af]">
          Generado por el Sistema de Gestión Legal — Inversiones Cavala
        </footer>
      </div>

      {/* Pie fijo — sólo en impresión, se repite en cada página */}
      <div className="reporte-pie-fijo">Generado por el Sistema de Gestión Legal — Inversiones Cavala</div>
    </div>
  );
}

function DatoCabecera({ label, valor, className }: { label: string; valor: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[9px] font-medium uppercase tracking-wide text-[#9ca3af]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#111827]">{valor}</dd>
    </div>
  );
}

function TituloSeccion({ numero, texto }: { numero: string; texto: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[13px] font-bold text-[#0f172a]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#1F3864] text-[10px] font-bold text-white">{numero}</span>
      {texto}
    </h2>
  );
}

function TarjetaCifra({ etiqueta, valor, acento = "#1F3864" }: { etiqueta: string; valor: number; acento?: string }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] px-3 py-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-[#9ca3af]">{etiqueta}</p>
      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: acento }}>{valor}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`border-b-2 border-[#1F3864]/20 px-2 py-1.5 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>;
}
