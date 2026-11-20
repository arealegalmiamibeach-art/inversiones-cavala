"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { exportarCsv, exportarExcel, type ColumnaExport } from "@/lib/export/tabla";
import { abrirReporteTabla } from "@/lib/export/reporte";
import { BOTON_NUEVO_CLASE } from "@/components/ui/crear-registro";

/**
 * Menú "Exportar" (Excel · CSV · PDF) para colgar en el slot `acciones` de
 * `RecordsTable` o en cualquier barra de herramientas.
 */
export function ExportMenu({
  nombre,
  columnas,
  filas,
  hrefPdf,
  titulo,
  filtros,
  className,
}: {
  /** Nombre base del archivo, sin extensión ni fecha (ej. "procesos-judiciales"). */
  nombre: string;
  columnas: ColumnaExport[];
  filas: any[];
  /** Vista de reporte a medida para la opción PDF. Si se omite, se genera un reporte tabular genérico. */
  hrefPdf?: string;
  /** Título opcional que se agrega como primera fila del Excel y como encabezado del reporte PDF. */
  titulo?: string;
  /** Descripción de los filtros activos para el reporte PDF genérico (ej. "Tipo: Propio"). */
  filtros?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [emitidoPor, setEmitidoPor] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const sinDatos = filas.length === 0;

  useEffect(() => {
    function onOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setAbierto(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, []);

  useEffect(() => {
    // Sólo para la línea "Emitido por" del reporte PDF genérico.
    if (hrefPdf) return;
    let vivo = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (vivo) setEmitidoPor(data.user?.email ?? undefined);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [hrefPdf]);

  function exportar(formato: "excel" | "csv" | "pdf") {
    setAbierto(false);
    if (formato === "excel") exportarExcel(nombre, columnas, filas, titulo);
    else if (formato === "csv") exportarCsv(nombre, columnas, filas);
    else if (hrefPdf) window.open(hrefPdf, "_blank", "noopener,noreferrer");
    else abrirReporteTabla({ titulo: titulo ?? nombre, columnas, filas, emitidoPor, filtros });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={sinDatos}
        title={sinDatos ? "No hay registros para exportar" : "Exportar esta tabla"}
        className={BOTON_NUEVO_CLASE}
      >
        <Download className="h-3.5 w-3.5" />
        Exportar
        <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-500 transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div className="light-panel absolute right-0 top-[calc(100%+8px)] z-50 w-48 space-y-0.5 rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-1.5 shadow-sm">
          <OpcionExportar icono={<FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />} etiqueta="Excel (.xls)" onClick={() => exportar("excel")} />
          <OpcionExportar icono={<FileText className="h-3.5 w-3.5 text-blue-600" />} etiqueta="CSV" onClick={() => exportar("csv")} />
          <OpcionExportar icono={<Printer className="h-3.5 w-3.5 text-neutral-500" />} etiqueta="PDF (reporte)" onClick={() => exportar("pdf")} />
        </div>
      )}
    </div>
  );
}

function OpcionExportar({ icono, etiqueta, onClick }: { icono: React.ReactNode; etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-neutral-700 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900"
    >
      {icono}
      {etiqueta}
    </button>
  );
}
