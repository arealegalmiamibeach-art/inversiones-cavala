import { createClient } from "@/lib/supabase/server";
import { PersonalTable } from "./personal-table";
import { Lock } from "lucide-react";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { getAcceso } from "@/lib/auth/perfil";
import { puedeVerPersonal } from "@/lib/auth/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarContratosPersonal, cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; modalidad?: string; activo?: string; pagina?: string }>;
}) {
  const { q, modalidad, activo } = await searchParams;
  const supabase = await createClient();

  const busqueda = q?.trim().slice(0, 120) || undefined;

  const [{ data: personal, error }, rol] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("personal")
        .select("id, nombre, dni, cargo, correo, modalidad, activo, remuneracion, contrato_inicio, contrato_fin, firmado")
        .order("nombre")
        .order("id")
        .range(from, to)
    ),
    getAcceso(),
  ]);
  const accesoDenegado = !puedeVerPersonal(rol) || error?.code === "42501";
  if (error && !accesoDenegado) throw new Error("No se pudo cargar el personal");

  const filas = personal ?? [];
  const [adjuntosPorId, contratosPorPersonalId, propiedadesIniciales, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "personal", filas.map((persona) => persona.id)),
    cargarContratosPersonal(supabase, filas.map((persona) => persona.id)),
    cargarPropiedadesPersonalizadas(supabase, "personal", filas.map((persona) => persona.id)),
    cargarRelacionesEntidad(supabase, "personal", filas.map((persona) => persona.id)),
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Personal</h1>

        {/* Aviso de restricción */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Esta sección contiene datos personales (DNI, remuneraciones) protegidos por la{" "}
            <strong>Ley N° 29733</strong>. El acceso está restringido a roles <strong>admin</strong>{" "}
            y <strong>abogado</strong>.
          </span>
        </div>

        {accesoDenegado ? (
          <div className="glass-empty">
            <Lock className="h-10 w-10 text-white/15 mb-3" />
            <p className="text-sm font-medium text-white/45">Sin permiso de acceso</p>
            <p className="text-xs text-white/30 mt-1">Tu rol actual no tiene acceso a esta sección.</p>
          </div>
        ) : (
          <PersonalTable personal={filas} count={filas.length} q={busqueda} modalidad={modalidad} activo={activo} adjuntosPorId={adjuntosPorId} contratosPorPersonalId={contratosPorPersonalId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} />
        )}
      </div>
    </div>
  );
}
