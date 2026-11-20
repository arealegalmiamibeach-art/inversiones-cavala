/**
 * Reporte PDF genérico para cualquier tabla del sistema.
 *
 * `/procesos/reporte` es una vista de servidor hecha a medida (resumen
 * ejecutivo, gráficos, anexos). El resto de las tablas —entidades, contratos,
 * documentos— no justifican una vista propia cada una, pero sí necesitan algo
 * mejor que imprimir la página oscura del dashboard: este helper arma, en el
 * cliente y con los datos que ya están en memoria (las mismas filas y columnas
 * que alimentan el Excel/CSV), un documento A4 imprimible con la identidad de
 * Cavala y lo abre en una pestaña nueva lista para "Guardar como PDF".
 */

import type { ColumnaExport } from "./tabla";

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function celda(valor: string | number | null): string {
  if (valor == null || valor === "") return "—";
  return escaparHtml(String(valor));
}

/** "Propietarios — Inversiones Cavala" → "Propietarios" para el encabezado. */
function tituloLimpio(titulo: string): string {
  return titulo.split("—")[0].trim() || titulo.trim();
}

function fechaLarga(fecha = new Date()): string {
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
}

const ESTILOS = (orientacion: "portrait" | "landscape") => `
@page { size: A4 ${orientacion}; margin: 15mm 12mm 18mm 12mm; }
@page { @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #6b7280; } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #e7e9ee;
  color: #111827;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.hoja {
  width: ${orientacion === "landscape" ? "297mm" : "210mm"};
  max-width: 100%;
  margin: 36px auto;
  background: #fff;
  box-shadow: 0 30px 80px rgba(0,0,0,.35);
}
header {
  border-bottom: 4px solid #1F3864;
  padding: 32px 32px 20px;
}
.marca { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: #1F3864; }
h1 { margin: 4px 0 0; font-size: 21px; font-weight: 700; color: #0f172a; }
dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 28px; margin: 18px 0 0; font-size: 10.5px; }
dl .ancho { grid-column: 1 / -1; }
dt { font-size: 8.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; }
dd { margin: 2px 0 0; font-weight: 500; color: #111827; }
.contenido { padding: 22px 32px 8px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th {
  background: #f1f5f9;
  border-bottom: 2px solid rgba(31,56,100,.25);
  padding: 5px 6px;
  text-align: left;
  font-weight: 600;
  color: #374151;
}
td {
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #e5e7eb;
  overflow-wrap: anywhere;
  word-break: break-word;
}
tbody tr:nth-child(even) td { background: #fafafa; }
.vacio { padding: 24px 6px; text-align: center; color: #9ca3af; font-size: 11px; }
footer {
  border-top: 1px solid #e5e7eb;
  padding: 14px 32px 22px;
  text-align: center;
  font-size: 9px;
  color: #9ca3af;
}
.barra {
  position: fixed;
  top: 18px;
  right: 20px;
  z-index: 10;
}
.barra button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  background: #1F3864;
  padding: 10px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 12px 30px -6px rgba(0,0,0,.5);
}
.barra button:hover { background: #28497f; }
@media print {
  body { background: #fff; }
  .hoja { width: auto; margin: 0; box-shadow: none; }
  .barra { display: none !important; }
}
`;

export function abrirReporteTabla({
  titulo,
  columnas,
  filas,
  emitidoPor,
  filtros,
}: {
  /** Título de la tabla, como se pasa al ExportMenu (ej. "Propietarios — Inversiones Cavala"). */
  titulo: string;
  columnas: ColumnaExport[];
  filas: any[];
  /** Correo de quien genera el reporte, si se conoce. */
  emitidoPor?: string;
  /** Descripción de los filtros activos ("Tipo: Propio · Persona: Natural"), opcional. */
  filtros?: string;
}): void {
  const nombre = tituloLimpio(titulo);
  const orientacion: "portrait" | "landscape" = columnas.length > 6 ? "landscape" : "portrait";

  const encabezados = columnas.map((c) => `<th>${escaparHtml(c.header)}</th>`).join("");
  const cuerpo = filas.length
    ? filas
        .map(
          (fila) =>
            `<tr>${columnas.map((c) => `<td>${celda(c.valor(fila))}</td>`).join("")}</tr>`,
        )
        .join("")
    : `<tr><td class="vacio" colspan="${columnas.length}">Sin registros para incluir en el reporte.</td></tr>`;

  const datosCabecera = [
    ["Fecha de emisión", fechaLarga()],
    ["Emitido por", emitidoPor?.trim() || "—"],
    ["Total de registros", String(filas.length)],
    ["Columnas", String(columnas.length)],
  ]
    .map(([dt, dd]) => `<div><dt>${escaparHtml(dt)}</dt><dd>${escaparHtml(dd)}</dd></div>`)
    .join("");
  const filaFiltros = `<div class="ancho"><dt>Alcance</dt><dd>${
    filtros?.trim()
      ? escaparHtml(filtros)
      : "Refleja la búsqueda y los filtros activos en la tabla al generar el reporte"
  }</dd></div>`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escaparHtml(nombre)} — Reporte · Inversiones Cavala</title>
<style>${ESTILOS(orientacion)}</style>
</head>
<body>
<div class="barra"><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div>
<div class="hoja">
  <header>
    <p class="marca">Inversiones Cavala S.A.C.</p>
    <h1>Reporte — ${escaparHtml(nombre)}</h1>
    <dl>${datosCabecera}${filaFiltros}</dl>
  </header>
  <div class="contenido">
    <table>
      <thead><tr>${encabezados}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
  </div>
  <footer>Generado por el Sistema de Gestión Legal — Inversiones Cavala</footer>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Sin `noopener`: con esa opción `window.open` devuelve siempre `null` y no
  // podríamos distinguir el caso de ventana bloqueada. El documento es HTML
  // propio y estático, así que la referencia `opener` no supone riesgo.
  const ventana = window.open(url, "_blank");
  if (!ventana) {
    URL.revokeObjectURL(url);
    alert("El navegador bloqueó la ventana del reporte. Permite las ventanas emergentes para este sitio y vuelve a intentarlo.");
    return;
  }
  // La pestaña nueva ya cargó el documento; liberar el objeto tras un margen.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
