import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Files } from "lucide-react";
import { redirect } from "next/navigation";
import {
  CopiasLiteralesTable,
  type CopiaLiteral,
} from "./copias-literales-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";

export default async function CopiasLiteralesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  if (sp.q !== undefined || sp.pagina !== undefined) redirect("/documentos/copias-literales");

  const supabase = await createClient();

  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from("documentos")
      .select("id, nombre, fecha, detalle, extra")
      .eq("tipo", "copia_literal")
      .order("fecha", { ascending: false, nullsFirst: false })
      .order("nombre")
      .order("id")
      .range(from, to)
  );
  if (error) throw new Error("No se pudieron cargar las copias literales");
  const documentos = (data ?? []) as CopiaLiteral[];
  const relacionesPorId = await cargarRelacionesEntidad(
    supabase,
    "documento",
    documentos.map((documento) => documento.id)
  );
  const copias = documentos.map((documento) => ({
    ...documento,
  }));
  const [adjuntosPorId, propiedadesIniciales] = await Promise.all([
    contarArchivosPorEntidad(supabase, "documento", documentos.map((documento) => documento.id)),
    cargarPropiedadesPersonalizadas(supabase, "documento", documentos.map((documento) => documento.id), "copia_literal"),
  ]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Copias literales" />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex justify-end">
          <p className="text-xs text-white/40">
            Vista documental · datos existentes de Copias Literales
          </p>
        </div>

        {copias.length === 0 ? (
          <div className="glass-empty">
            <Files className="mb-3 h-10 w-10 text-white/15" />
            <p className="text-sm font-medium text-white/45">Sin resultados</p>
          </div>
        ) : (
          <CopiasLiteralesTable copias={copias} count={copias.length} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} />
        )}
      </div>
    </div>
  );
}
