"use client";

import type { EventoCalendario } from "@/lib/calendario";
import { CATEGORIA_META, MESES, generarGrillaMes, hoyEnLima, claveDia } from "@/lib/calendario";

// ─── Colores RGB por categoría (para jsPDF) ─────────────────────────────────
const CAT_RGB: Record<string, [number, number, number]> = {
  contrato:  [ 99, 102, 241], // indigo
  vehiculo:  [245, 158,  11], // amber
  personal:  [ 16, 185, 129], // emerald
  documento: [139,  92, 246], // violet
  proceso:   [239,  68,  68], // red
  evento:    [236,  72, 153], // pink
};

// Versiones pastel para el fondo del chip en el calendario PDF
const CAT_RGB_LIGHT: Record<string, [number, number, number]> = {
  contrato:  [230, 231, 250],
  vehiculo:  [254, 243, 199],
  personal:  [209, 250, 229],
  documento: [237, 233, 254],
  proceso:   [254, 226, 226],
  evento:    [253, 224, 241],
};

const DIAS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_LABEL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function sufijo(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

function fechaExport(): string {
  const hoy = new Date();
  return `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
}


export async function exportarCalendarioPDF(
  eventos: EventoCalendario[],
  mesActivo: { anio: number; mes: number }
) {
  const { default: jsPDF } = await import("jspdf");

  const { anio, mes: mesIdx } = mesActivo; // mesIdx es 0-based (igual que Date.getMonth())
  const mesKey = `${anio}-${String(mesIdx + 1).padStart(2, "0")}`;

  // Solo los eventos del mes visible
  const eventosDelMes = eventos.filter((e) => e.fecha.startsWith(mesKey));

  // Agrupar por día
  const porDia = new Map<string, EventoCalendario[]>();
  for (const e of eventosDelMes) {
    if (!porDia.has(e.fecha)) porDia.set(e.fecha, []);
    porDia.get(e.fecha)!.push(e);
  }

  const grilla = generarGrillaMes(anio, mesIdx);
  const hoyKey = claveDia(hoyEnLima());

  // ── Dimensiones A4 landscape ──────────────────────────────────────────────
  const PW = 297, PH = 210;
  const ML = 10, MR = 10, MT = 10;
  const W = PW - ML - MR;        // 277 mm
  const CELL_W = W / 7;           // ≈ 39.6 mm por columna
  const HEADER_H = 22;
  const DOW_H = 7;
  const GRID_Y = MT + HEADER_H + DOW_H;
  const GRID_H = PH - GRID_Y - 8;
  const ROWS = 6;
  const CELL_H = GRID_H / ROWS;  // ≈ 25.5 mm por fila

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ════════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — Grilla mensual
  // ════════════════════════════════════════════════════════════════════════════

  // Fondo blanco
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PW, PH, "F");

  // ── Encabezado ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${MESES_LABEL[mesIdx]} ${anio}`, ML, MT + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Inversiones Cavala S.A.C.  ·  Exportado el ${fechaExport()}  ·  ${eventosDelMes.length} evento(s) este mes`,
    ML, MT + 16
  );

  // Leyenda de categorías a la derecha
  {
    const catEntradas = Object.entries(CAT_RGB);
    let lx = PW - MR;
    for (let i = catEntradas.length - 1; i >= 0; i--) {
      const [catKey, rgb] = catEntradas[i];
      const label = CATEGORIA_META[catKey as keyof typeof CATEGORIA_META]?.label ?? catKey;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const tw = doc.getTextWidth(label);
      lx -= tw + 1;
      doc.text(label, lx, MT + 9);
      lx -= 4.5;
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.circle(lx + 1.5, MT + 7.5, 1.5, "F");
      lx -= 5;
    }
  }

  // ── Fila días de la semana ─────────────────────────────────────────────────
  const dowY = MT + HEADER_H;
  doc.setFillColor(30, 41, 59);
  doc.rect(ML, dowY, W, DOW_H, "F");
  for (let i = 0; i < 7; i++) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(DIAS_LABEL[i], ML + i * CELL_W + CELL_W / 2, dowY + 4.8, { align: "center" });
  }

  // ── Celdas ─────────────────────────────────────────────────────────────────
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < 7; col++) {
      const dia = grilla[row * 7 + col]!;
      const diaKey = claveDia(dia);
      const esMesActual = dia.getMonth() === mesIdx;
      const esHoy = diaKey === hoyKey;
      const cx = ML + col * CELL_W;
      const cy = GRID_Y + row * CELL_H;

      // Fondo
      if (esHoy) doc.setFillColor(238, 242, 255);
      else if (esMesActual) doc.setFillColor(255, 255, 255);
      else doc.setFillColor(249, 250, 251);
      doc.rect(cx, cy, CELL_W, CELL_H, "F");

      // Borde
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(cx, cy, CELL_W, CELL_H);

      // Número del día
      if (esHoy) {
        doc.setFillColor(99, 102, 241);
        doc.circle(cx + CELL_W - 5, cy + 5, 3.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(String(dia.getDate()), cx + CELL_W - 5, cy + 6.5, { align: "center" });
      } else {
        doc.setFont("helvetica", esMesActual ? "bold" : "normal");
        doc.setFontSize(8);
        doc.setTextColor(esMesActual ? 30 : 180);
        doc.text(String(dia.getDate()), cx + CELL_W - 3, cy + 5.8, { align: "right" });
      }

      // Eventos del día
      const evsDia = porDia.get(diaKey) ?? [];
      const MAX = 3;
      let ey = cy + 10.5;

      for (let ei = 0; ei < Math.min(evsDia.length, MAX); ei++) {
        const ev = evsDia[ei]!;
        const rgb = CAT_RGB[ev.categoria] ?? [100, 100, 100];
        const rgbLight = CAT_RGB_LIGHT[ev.categoria] ?? [240, 240, 240];

        // Altura dinámica del chip: 1 o 2 líneas
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        const textWidth = CELL_W - 6.5; // espacio disponible para el texto
        const lines = doc.splitTextToSize(ev.titulo, textWidth);
        const visibleLines = lines.slice(0, 2) as string[];
        const chipH = visibleLines.length === 1 ? 4.5 : 8;

        // Chip pastel
        doc.setFillColor(rgbLight[0], rgbLight[1], rgbLight[2]);
        doc.roundedRect(cx + 1.5, ey - 3.2, CELL_W - 3, chipH, 0.8, 0.8, "F");

        // Punto de color
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.circle(cx + 3.2, ey - 1, 1.1, "F");

        // Texto del evento (con wrap)
        doc.setTextColor(esMesActual ? 25 : 130);
        for (let li = 0; li < visibleLines.length; li++) {
          doc.text(visibleLines[li], cx + 6, ey + li * 3.5);
        }

        ey += chipH + 1.5;
      }

      // "+N más"
      if (evsDia.length > MAX) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(99, 102, 241);
        doc.text(`+${evsDia.length - MAX} más`, cx + 2.5, ey);
      }
    }
  }

  // Línea inferior
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(ML, GRID_Y + GRID_H, ML + W, GRID_Y + GRID_H);

  // ════════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Agenda detallada del mes
  // ════════════════════════════════════════════════════════════════════════════

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PW, PH, "F");

  // Encabezado pág 2
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`Agenda — ${MESES_LABEL[mesIdx]} ${anio}`, ML, MT + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Inversiones Cavala S.A.C.  ·  Todos los eventos del mes ordenados por fecha", ML, MT + 15);

  // Ordenar eventos por fecha
  const eventosOrdenados = [...eventosDelMes].sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (eventosOrdenados.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("No hay eventos registrados para este mes.", ML, MT + 40);
  } else {
    // Cabecera de la tabla
    const TABLE_Y = MT + 22;
    const COL = {
      fecha:  { x: ML,       w: 22 },
      cat:    { x: ML + 22,  w: 26 },
      titulo: { x: ML + 48,  w: 90 },
      detalle:{ x: ML + 138, w: W - 128 },
    };
    const ROW_H_MIN = 7;

    // Fondo encabezado tabla
    doc.setFillColor(30, 41, 59);
    doc.rect(ML, TABLE_Y, W, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text("Fecha",     COL.fecha.x  + 2, TABLE_Y + 4.8);
    doc.text("Categoría", COL.cat.x    + 2, TABLE_Y + 4.8);
    doc.text("Título",    COL.titulo.x + 2, TABLE_Y + 4.8);
    doc.text("Detalle",   COL.detalle.x + 2, TABLE_Y + 4.8);

    let ry = TABLE_Y + 7;
    let filaImpar = false;

    for (const ev of eventosOrdenados) {
      const rgb = CAT_RGB[ev.categoria] ?? [100, 100, 100];
      const rgbLight = CAT_RGB_LIGHT[ev.categoria] ?? [245, 245, 245];
      const catLabel = CATEGORIA_META[ev.categoria]?.label ?? ev.categoria;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);

      // Calcular líneas del título y detalle para saber la altura de la fila
      const tituloLines = doc.splitTextToSize(ev.titulo, COL.titulo.w - 4) as string[];
      const detalleText = [ev.subtitulo, ev.materia ? `Materia: ${ev.materia}` : null]
        .filter(Boolean).join(" · ");
      const detalleLines = detalleText
        ? (doc.splitTextToSize(detalleText, COL.detalle.w - 4) as string[])
        : [];

      const maxLines = Math.max(tituloLines.length, detalleLines.length, 1);
      const rowH = Math.max(ROW_H_MIN, maxLines * 3.8 + 3);

      // Salto de página si no cabe
      if (ry + rowH > PH - 12) {
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, PW, PH, "F");

        // Repetir cabecera
        doc.setFillColor(30, 41, 59);
        doc.rect(ML, MT, W, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(203, 213, 225);
        doc.text("Fecha",     COL.fecha.x  + 2, MT + 4.8);
        doc.text("Categoría", COL.cat.x    + 2, MT + 4.8);
        doc.text("Título",    COL.titulo.x + 2, MT + 4.8);
        doc.text("Detalle",   COL.detalle.x + 2, MT + 4.8);
        ry = MT + 7;
        filaImpar = false;
      }

      // Fondo alternado
      if (filaImpar) {
        doc.setFillColor(248, 250, 252);
        doc.rect(ML, ry, W, rowH, "F");
      }
      filaImpar = !filaImpar;

      // Borde inferior
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(ML, ry + rowH, ML + W, ry + rowH);

      const ty = ry + 3.5; // baseline primera línea

      // Fecha
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      const [, , dNum] = ev.fecha.split("-");
      doc.text(`${Number(dNum)} ${MESES_LABEL[mesIdx].substring(0, 3)}.`, COL.fecha.x + 2, ty);

      // Categoría — chip de color
      doc.setFillColor(rgbLight[0], rgbLight[1], rgbLight[2]);
      doc.roundedRect(COL.cat.x + 1, ry + 1.5, COL.cat.w - 2, rowH - 3, 1, 1, "F");
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.circle(COL.cat.x + 4.5, ty - 1, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.text(catLabel, COL.cat.x + 7, ty);

      // Título (multilínea)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      for (let li = 0; li < tituloLines.length; li++) {
        doc.text(tituloLines[li], COL.titulo.x + 2, ty + li * 3.8);
      }

      // Detalle (multilínea, gris)
      if (detalleLines.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        for (let li = 0; li < detalleLines.length; li++) {
          doc.text(detalleLines[li], COL.detalle.x + 2, ty + li * 3.8);
        }
      }

      ry += rowH;
    }
  }

  // Pie de página (todas las páginas)
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Inversiones Cavala S.A.C.  ·  ${MESES_LABEL[mesIdx]} ${anio}  ·  Página ${p} de ${totalPages}`,
      PW / 2, PH - 4, { align: "center" }
    );
  }

  doc.save(`Calendario_Cavala_${MESES_LABEL[mesIdx]}-${anio}.pdf`);
}
