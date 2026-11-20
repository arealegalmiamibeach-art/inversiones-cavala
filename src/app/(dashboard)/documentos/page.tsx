import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Files } from "lucide-react";
import Link from "next/link";
import { DocumentosList } from "./documentos-list";
import { rutaTipoDocumento } from "./tipos";
import { getTiposCompletos } from "./tipos-custom";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";

const PAGE_SIZE = 30;

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const busqueda = (sp.q ?? "").trim();

  const supabase = await createClient();

  // Filtros se aplican antes de order/limit para respetar el tipo del builder.
  let docsBase = supabase
    .from("documentos")
    .select("id, tipo, nombre, fecha, detalle");
  if (busqueda) docsBase = docsBase.ilike("nombre", `%${busqueda}%`);

  let countBase = supabase
    .from("documentos")
    .select("*", { count: "exact", head: true });
  if (busqueda) countBase = countBase.ilike("nombre", `%${busqueda}%`);

  const [
    TIPOS,
    { data: tiposParaChips },
    { data: documentos, error: documentosError },
    { count: total },
  ] = await Promise.all([
    getTiposCompletos(),
    // Solo la columna tipo: para los chips del header y tiposDisponibles.
    supabase.from("documentos").select("tipo"),
    docsBase.order("tipo").order("nombre").order("id").limit(PAGE_SIZE),
    countBase,
  ]);
  if (documentosError) throw new Error("No se pudieron cargar los documentos");

  const conteosPorTipo = (tiposParaChips ?? []).reduce<Record<string, number>>((acc, d) => {
    const t = d.tipo as string;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  // tiposDisponibles viene de todos los docs (no solo la página), para que el
  // selector de tipo en el panel lateral muestre todas las opciones reales.
  const tiposDisponibles = Array.from(
    new Set([...Object.keys(TIPOS), ...(tiposParaChips ?? []).map((d) => d.tipo as string)])
  ).sort();

  const idsDocumentos = (documentos ?? []).map((d) => d.id as string);
  const [adjuntosPorId, propiedadesIniciales, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "documento", idsDocumentos),
    cargarPropiedadesPersonalizadas(supabase, "documento", idsDocumentos),
    cargarRelacionesEntidad(supabase, "documento", idsDocumentos),
  ]);

  return (
    <div className="flex flex-col h-full">
      <Header title="Documentos" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        <div className="glass-panel flex flex-wrap items-center gap-2 px-3 py-2.5">
          <Link href="/documentos/tipos" className="mr-1 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/[0.05] hover:text-white">
            <Files className="h-3.5 w-3.5 text-brand-300" />
            Tipos documentales
          </Link>
          <span className="h-5 w-px bg-white/10" />
          {Object.entries(conteosPorTipo)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([tipoDocumento, cantidad]) => (
              <Link key={tipoDocumento} href={rutaTipoDocumento(tipoDocumento)} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-white/70 hover:border-brand-400/25 hover:bg-brand-500/10 hover:text-brand-100">
                {TIPOS[tipoDocumento] ?? tipoDocumento} <span className="ml-1 text-white/45">{cantidad}</span>
              </Link>
            ))}
        </div>

        <DocumentosList
          key={busqueda}
          documentos={documentos ?? []}
          tiposDisponibles={tiposDisponibles}
          total={total ?? 0}
          busqueda={busqueda}
          hasMore={(total ?? 0) > (documentos?.length ?? 0)}
          nextOffset={documentos?.length ?? 0}
          adjuntosPorId={adjuntosPorId}
          relacionesPorId={relacionesPorId}
          tiposMap={TIPOS}
          propiedadesIniciales={propiedadesIniciales}
        />
      </div>
    </div>
  );
}
