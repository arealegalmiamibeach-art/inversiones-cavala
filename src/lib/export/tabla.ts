/**
 * Exportación de cualquier tabla a CSV o Excel, sin dependencias de npm.
 * Excel se genera como SpreadsheetML 2003 (XML) — Excel y Google Sheets lo
 * abren sin el aviso de "el formato no coincide con la extensión" que sale
 * con el truco de servir una tabla HTML con extensión .xls.
 */

export type ColumnaExport = {
  header: string;
  valor: (row: any) => string | number | null;
};

type ColumnaTabla<Row> = {
  id: string;
  label: string;
  menuLabel?: string;
  sortValue?: (row: Row) => unknown;
  filterValue?: (row: Row) => unknown;
};

function aCelda(valor: unknown): string | number | null {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return valor;
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (valor instanceof Date) return fechaLocalISO(valor);
  return String(valor);
}

/**
 * Deriva las columnas de exportación de las columnas de `RecordsTable`, para
 * no repetir en cada página la lista de campos. Se quedan fuera las columnas
 * sin valor exportable (la de acciones, por ejemplo), porque su contenido es
 * un enlace y no un dato.
 */
export function columnasDesdeTabla<Row>(columnas: ColumnaTabla<Row>[]): ColumnaExport[] {
  return columnas
    .filter((columna) => columna.filterValue || columna.sortValue)
    .map((columna) => ({
      header: columna.menuLabel ?? columna.label ?? columna.id,
      valor: (row: Row) => aCelda(columna.filterValue?.(row) ?? columna.sortValue?.(row) ?? null),
    })) as ColumnaExport[];
}

/**
 * Arma la línea "Filtros" del reporte PDF a partir de los filtros de página.
 * Descarta los vacíos y devuelve `undefined` si no hay ninguno activo, que es
 * lo que `ExportMenu` espera para caer en su texto genérico.
 */
export function descripcionFiltros(partes: [string, string | null | undefined][]): string | undefined {
  const activos = partes
    .filter(([, valor]) => typeof valor === "string" && valor.trim() !== "")
    .map(([etiqueta, valor]) => `${etiqueta}: ${(valor as string).trim()}`);
  return activos.length > 0 ? activos.join(" · ") : undefined;
}

const RX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const RX_FECHA_PE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function fechaLocalISO(fecha = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Arma el nombre final del archivo: base + fecha de hoy + extensión. */
function nombreConFecha(nombreArchivo: string, extension: string): string {
  const base = nombreArchivo.trim().replace(/\.[a-z0-9]+$/i, "").replace(/\s+/g, "-");
  return `${base}-${fechaLocalISO()}.${extension}`;
}

function descargarBlob(nombreArchivo: string, partes: BlobPart[], mime: string) {
  const blob = new Blob(partes, { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

// ─── CSV ────────────────────────────────────────────────────────────────

// Excel y Google Sheets ejecutan como fórmula una celda que empieza por =, +,
// - o @ (también tras un tabulador o un retorno): un texto cargado en el
// sistema como `=HYPERLINK(...)` se volvería un enlace activo al abrir el CSV.
// A esos textos se les antepone un apóstrofo. Un número escrito como texto
// ("-12,5") no es fórmula y se deja igual.
const RX_FORMULA = /^[=+\-@\t\r]/;
const RX_NUMERO = /^[+-]?\d+(?:[.,]\d+)?$/;

export function celdaCsv(valor: string | number | null): string {
  if (valor == null) return "";
  let texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
  if (typeof valor === "string" && RX_FORMULA.test(texto) && !RX_NUMERO.test(texto)) texto = `'${texto}`;
  if (/[;"\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function exportarCsv(nombreArchivo: string, columnas: ColumnaExport[], filas: any[]): void {
  const lineas = [
    columnas.map((columna) => celdaCsv(columna.header)).join(";"),
    ...filas.map((fila) => columnas.map((columna) => celdaCsv(columna.valor(fila))).join(";")),
  ];
  // BOM UTF-8: sin esto, Excel en español interpreta el archivo como
  // ANSI/Latin-1 y rompe tildes y "ñ".
  descargarBlob(nombreConFecha(nombreArchivo, "csv"), ["﻿", lineas.join("\r\n")], "text/csv;charset=utf-8;");
}

// ─── Excel (SpreadsheetML 2003) ────────────────────────────────────────

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** Detecta fecha ISO o dd/mm/aaaa y la vuelve al formato que exige SpreadsheetML. */
function comoFechaXml(valor: string): string | null {
  if (RX_FECHA_ISO.test(valor)) return `${valor}T00:00:00.000`;
  const m = valor.match(RX_FECHA_PE);
  if (m) {
    const [, d, mes, y] = m;
    return `${y}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000`;
  }
  return null;
}

function celdaExcel(valor: string | number | null): string {
  if (valor == null || valor === "") return "<Cell></Cell>";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<Cell><Data ss:Type="Number">${valor}</Data></Cell>`;
  }
  const texto = String(valor);
  const fechaXml = comoFechaXml(texto);
  if (fechaXml) {
    return `<Cell ss:StyleID="Fecha"><Data ss:Type="DateTime">${fechaXml}</Data></Cell>`;
  }
  const estilo = texto.length > 28 ? ' ss:StyleID="TextoLargo"' : "";
  return `<Cell${estilo}><Data ss:Type="String">${escaparXml(texto)}</Data></Cell>`;
}

function anchoColumna(columna: ColumnaExport, filas: any[]): number {
  let max = columna.header.length;
  for (const fila of filas) {
    const v = columna.valor(fila);
    const largo = v == null ? 0 : String(v).length;
    if (largo > max) max = largo;
  }
  return Math.min(280, Math.max(64, (max + 2) * 6.5));
}

export function exportarExcel(nombreArchivo: string, columnas: ColumnaExport[], filas: any[], titulo?: string): void {
  const filasHoja = titulo ? 2 : 1; // filas de encabezado antes de los datos (para congelar y para el título)

  const columnasXml = columnas.map((columna) => `<Column ss:Width="${anchoColumna(columna, filas)}"/>`).join("");

  const filaTitulo = titulo
    ? `<Row ss:Height="24"><Cell ss:StyleID="Titulo" ss:MergeAcross="${Math.max(0, columnas.length - 1)}"><Data ss:Type="String">${escaparXml(titulo)}</Data></Cell></Row>`
    : "";

  const filaEncabezados = `<Row ss:Height="20">${columnas.map((c) => `<Cell ss:StyleID="Encabezado"><Data ss:Type="String">${escaparXml(c.header)}</Data></Cell>`).join("")}</Row>`;

  const filasDatos = filas
    .map((fila) => `<Row>${columnas.map((columna) => celdaExcel(columna.valor(fila))).join("")}</Row>`)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Company>Inversiones Cavala S.A.C.</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Font ss:FontName="Calibri" ss:Size="10"/>
   <Alignment ss:Vertical="Top"/>
  </Style>
  <Style ss:ID="Titulo">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1F3864"/>
  </Style>
  <Style ss:ID="Encabezado">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F3864" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="Fecha">
   <NumberFormat ss:Format="dd/mm/yyyy"/>
  </Style>
  <Style ss:ID="TextoLargo">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Reporte">
  <Table>${columnasXml}
   ${filaTitulo}${filaEncabezados}${filasDatos}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${filasHoja}</SplitHorizontal>
   <TopRowBottomPane>${filasHoja}</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  descargarBlob(nombreConFecha(nombreArchivo, "xls"), [xml], "application/vnd.ms-excel;charset=utf-8;");
}
