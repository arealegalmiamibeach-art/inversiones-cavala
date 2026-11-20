import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { Header } from "@/components/layout/header";
import { DocumentosList } from "../../documentos-list";
import { getTiposCompletos } from "../../tipos-custom";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { createClient } from "@/lib/supabase/server";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";

const PAGE_SIZE = 30;

export default async function DocumentosPorTipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tipo } = await params;
  const sp = await searchParams;

  // Redirección temprana: no necesita supabase ni TIPOS.
  if (tipo === "copia_literal") redirect("/documentos/copias-literales");

  const busqueda = (sp.q ?? "").trim();
  const supabase = await createClient();

  let docsBase = supabase
    .from("documentos")
    .select("id, tipo, nombre, fecha, detalle")
    .eq("tipo", tipo);
  if (busqueda) docsBase = docsBase.ilike("nombre", `%${busqueda}%`);

  let countBase = supabase
    .from("documentos")
    .select("*", { count: "exact", head: true })
    .eq("tipo", tipo);
  if (busqueda) countBase = countBase.ilike("nombre", `%${busqueda}%`);

  const [TIPOS, { data: documentos, error }, { count: total }] = await Promise.all([
    getTiposCompletos(),
    docsBase
      .order("fecha", { ascending: false, nullsFirst: false })
      .order("nombre")
      .order("id")
      .limit(PAGE_SIZE),
    countBase,
  ]);

  if (!TIPOS[tipo]) notFound();
  if (error) throw new Error("No se pudieron cargar los documentos de este tipo");

  const idsDocumentos = (documentos ?? []).map((d) => d.id as string);
  const [adjuntosPorId, propiedadesIniciales, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "documento", idsDocumentos),
    cargarPropiedadesPersonalizadas(supabase, "documento", idsDocumentos, tipo),
    cargarRelacionesEntidad(supabase, "documento", idsDocumentos),
  ]);

  return (
    <div className="flex h-full flex-col">
      <Header title={TIPOS[tipo]} />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/documentos/tipos" aria-label="Volver a tipos documentales" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white">
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link href="/documentos" className="text-xs font-medium text-brand-300 hover:text-brand-200">Todos los documentos →</Link>
        </div>

        <DocumentosList
          key={busqueda}
          documentos={documentos ?? []}
          tiposDisponibles={Object.keys(TIPOS)}
          tiposMap={TIPOS}
          total={total ?? 0}
          busqueda={busqueda}
          hasMore={(total ?? 0) > (documentos?.length ?? 0)}
          nextOffset={documentos?.length ?? 0}
          adjuntosPorId={adjuntosPorId}
          relacionesPorId={relacionesPorId}
          showType={false}
          storageKey={`documentos-${tipo}`}
          tipoFijo={tipo}
          propiedadesIniciales={propiedadesIniciales}
        />

      </div>
    </div>
  );
}
