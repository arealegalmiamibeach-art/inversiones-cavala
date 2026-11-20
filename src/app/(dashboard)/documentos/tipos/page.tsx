import Link from "next/link";
import {
  Archive,
  BookOpenCheck,
  Building2,
  FileBarChart,
  Files,
  FolderOpen,
  LandPlot,
  MapPinned,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { rutaTipoDocumento } from "../tipos";
import { getTiposCompletos, listarTiposCustom } from "../tipos-custom";
import { CrearTipoBtn } from "./crear-tipo-btn";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type DocumentoResumen = {
  tipo: string;
  fecha: string | null;
  detalle: string | null;
};

const ICONOS: Record<string, LucideIcon> = {
  copia_literal: Files,
  testimonio: BookOpenCheck,
  titulo_archivado: Archive,
  minuta: ScrollText,
  vigencia_poder: ShieldCheck,
  junta_general: UsersRound,
  documento_municipal: Building2,
  constancia_posesion: MapPinned,
  multa: ReceiptText,
  habilitacion_urbana: LandPlot,
  reporte: FileBarChart,
};

export default async function TiposDocumentalesPage() {
  const supabase = await createClient();
  const [TIPOS, tiposCustom, { data }] = await Promise.all([
    getTiposCompletos(),
    listarTiposCustom(),
    fetchAllRows((from, to) =>
      supabase
        .from("documentos")
        .select("tipo, fecha, detalle")
        .order("tipo")
        .order("id")
        .range(from, to)
    ),
  ]);

  const resumen = ((data ?? []) as DocumentoResumen[]).reduce<Record<string, { total: number; conFecha: number; conDetalle: number }>>((tipos, documento) => {
    const actual = tipos[documento.tipo] ?? { total: 0, conFecha: 0, conDetalle: 0 };
    actual.total += 1;
    if (documento.fecha) actual.conFecha += 1;
    if (documento.detalle?.trim()) actual.conDetalle += 1;
    tipos[documento.tipo] = actual;
    return tipos;
  }, {});

  // Incluir tipos custom que aún no tienen documentos
  for (const tc of tiposCustom) {
    if (!resumen[tc.slug]) {
      resumen[tc.slug] = { total: 0, conFecha: 0, conDetalle: 0 };
    }
  }

  const tipos = Object.entries(resumen)
    .map(([tipo, datos]) => ({ tipo, label: TIPOS[tipo] ?? tipo, ...datos }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "es-PE"));
  const total = tipos.reduce((suma, tipo) => suma + tipo.total, 0);

  return (
    <div className="flex h-full flex-col">
      <Header title="Tipos documentales" />
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/90">Archivo documental de Cavala</p>
            <p className="mt-1 text-xs leading-5 text-white/60">
              {total.toLocaleString("es-PE")} documentos organizados en {tipos.length} tipos con registros.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CrearTipoBtn />
            <Link href="/documentos" className="glass-btn-secondary px-3 py-2 text-xs">
              <FolderOpen className="h-3.5 w-3.5" /> Ver todos
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tipos.map((tipo) => {
            const Icon = ICONOS[tipo.tipo] ?? Files;
            const fechaPct = tipo.total > 0 ? Math.round((tipo.conFecha / tipo.total) * 100) : 0;
            const detallePct = tipo.total > 0 ? Math.round((tipo.conDetalle / tipo.total) * 100) : 0;
            return (
              <Link
                key={tipo.tipo}
                href={rutaTipoDocumento(tipo.tipo)}
                className="glass-card group flex min-h-[150px] flex-col justify-between p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/15 text-brand-300 transition-colors group-hover:border-brand-300/40 group-hover:bg-brand-500/20">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums text-white">{tipo.total.toLocaleString("es-PE")}</span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white/95 group-hover:text-brand-200">{tipo.label}</h2>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-white/60">
                    <span>{fechaPct}% con fecha</span>
                    <span className="h-1 w-1 rounded-full bg-white/30" />
                    <span>{detallePct}% con resumen</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
