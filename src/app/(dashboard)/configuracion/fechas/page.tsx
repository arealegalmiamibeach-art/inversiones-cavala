import { redirect } from "next/navigation";
import { CalendarCog } from "lucide-react";
import { getRol } from "@/lib/auth/perfil";
import { createClient } from "@/lib/supabase/server";
import {
  cargarConfigFechas,
  configDe,
  FUENTES_FIJAS,
  fuenteDocumento,
  fuentePropiedad,
} from "@/lib/fechas-config";
import { ENTIDADES_PERSONALIZABLES, esTipoEntidadPersonalizable } from "@/lib/propiedades/personalizadas";
import { hoyISOEnLima } from "@/lib/utils";
import { TIPOS as TIPOS_DOCUMENTO } from "../../documentos/tipos";
import { FechasPanel, type GrupoFechas } from "./fechas-panel";

function conteo(total: number, futuras: number): string {
  if (total === 0) return "Sin fechas cargadas todavía";
  const base = `${total} ${total === 1 ? "fecha" : "fechas"}`;
  return futuras > 0 ? `${base} · ${futuras} por venir` : `${base} · todas pasadas`;
}

export default async function FechasPage() {
  if (await getRol() !== "administrador") redirect("/dashboard");

  const supabase = await createClient();
  const hoy = hoyISOEnLima();

  const [config, { data: tiposCustom }, { data: documentos }, { data: propiedades }] = await Promise.all([
    cargarConfigFechas(supabase),
    supabase.from("tipos_documento_custom").select("slug, nombre"),
    supabase.from("documentos").select("tipo, fecha").not("fecha", "is", null).limit(10000),
    supabase.from("propiedades_personalizadas").select("id, nombre, entidad_tipo").eq("tipo", "fecha").order("nombre"),
  ]);

  const { data: valores } = propiedades?.length
    ? await supabase
        .from("valores_propiedad_personalizada")
        .select("propiedad_id, valor")
        .in("propiedad_id", propiedades.map((p) => p.id as string))
        .limit(10000)
    : { data: [] as { propiedad_id: string; valor: unknown }[] };

  const cuenta = (pares: Array<[string, string]>) => {
    const mapa = new Map<string, { total: number; futuras: number }>();
    for (const [clave, fecha] of pares) {
      const actual = mapa.get(clave) ?? { total: 0, futuras: 0 };
      actual.total += 1;
      if (fecha >= hoy) actual.futuras += 1;
      mapa.set(clave, actual);
    }
    return mapa;
  };

  const porTipoDocumento = cuenta(
    ((documentos ?? []) as { tipo: string | null; fecha: string }[])
      .filter((d) => d.tipo)
      .map((d) => [d.tipo as string, d.fecha])
  );
  const porPropiedad = cuenta(
    ((valores ?? []) as { propiedad_id: string; valor: unknown }[])
      .filter((v) => typeof v.valor === "string")
      .map((v) => [v.propiedad_id, (v.valor as string).slice(0, 10)])
  );

  const etiquetasDocumento: Record<string, string> = { ...TIPOS_DOCUMENTO };
  for (const t of (tiposCustom ?? []) as { slug: string; nombre: string }[]) etiquetasDocumento[t.slug] = t.nombre;

  const grupos: GrupoFechas[] = [];
  for (const grupo of Array.from(new Set(FUENTES_FIJAS.map((f) => f.grupo)))) {
    grupos.push({
      titulo: grupo,
      filas: FUENTES_FIJAS.filter((f) => f.grupo === grupo).map((f) => ({
        fuente: f.fuente,
        label: f.label,
        config: configDe(config, f.fuente),
        aceptaVigencia: false,
      })),
    });
  }

  grupos.push({
    titulo: "Documentos",
    descripcion: "La fecha de un documento es la de emisión. Si un tipo caduca, márcalo como vencimiento e indica a los cuántos días.",
    filas: Object.entries(etiquetasDocumento)
      .map(([slug, nombre]) => ({ slug, nombre, n: porTipoDocumento.get(slug) ?? { total: 0, futuras: 0 } }))
      .sort((a, b) => b.n.total - a.n.total || a.nombre.localeCompare(b.nombre, "es-PE"))
      .map(({ slug, nombre, n }) => ({
        fuente: fuenteDocumento(slug),
        label: nombre,
        detalle: conteo(n.total, n.futuras),
        config: configDe(config, fuenteDocumento(slug)),
        aceptaVigencia: true,
      })),
  });

  const filasPropiedades = ((propiedades ?? []) as { id: string; nombre: string; entidad_tipo: string }[])
    .filter((p) => esTipoEntidadPersonalizable(p.entidad_tipo))
    .map((p) => {
      const n = porPropiedad.get(p.id) ?? { total: 0, futuras: 0 };
      const entidad = ENTIDADES_PERSONALIZABLES[p.entidad_tipo as keyof typeof ENTIDADES_PERSONALIZABLES];
      return {
        fuente: fuentePropiedad(p.id),
        label: p.nombre,
        detalle: `${entidad.plural} · ${conteo(n.total, n.futuras)}`,
        config: configDe(config, fuentePropiedad(p.id)),
        aceptaVigencia: false,
      };
    });

  grupos.push({
    titulo: "Propiedades personalizadas",
    descripcion: "Las columnas de tipo fecha que se agregan en cualquier ficha. Las nuevas aparecen aquí solas.",
    filas: filasPropiedades,
    vacio: "Todavía no hay propiedades de tipo fecha.",
  });

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/20 bg-gradient-to-br from-brand-500/20 to-brand-600/10 text-brand-300">
          <CalendarCog className="h-5 w-5" />
        </div>
        <div>
          <p className="mb-1 text-[10px] text-white/40">Configuración / Fechas y avisos</p>
          <h1 className="text-base font-semibold text-white">Fechas y avisos</h1>
          <p className="mt-0.5 text-xs text-white/50">Decide qué fechas salen en el calendario y cuáles te avisan antes de vencer.</p>
        </div>
      </header>
      <FechasPanel grupos={grupos} />
    </div>
  );
}
