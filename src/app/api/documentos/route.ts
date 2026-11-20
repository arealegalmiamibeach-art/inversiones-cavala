import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";

const LIMITE = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const tipo = (searchParams.get("tipo") ?? "").trim();
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const supabase = await createClient();

  let base = supabase.from("documentos").select("id, tipo, nombre, fecha, detalle");
  if (q) base = base.ilike("nombre", `%${q}%`);
  if (tipo) base = base.eq("tipo", tipo);

  const { data: rows, error } = await base
    .order("tipo").order("nombre").order("id")
    .range(offset, offset + LIMITE - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.id as string);
  const [adjuntosPorId, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "documento", ids),
    cargarRelacionesEntidad(supabase, "documento", ids),
  ]);

  const nextOffset = rows && rows.length === LIMITE ? offset + LIMITE : null;

  return NextResponse.json({ rows: rows ?? [], adjuntosPorId, relacionesPorId, nextOffset });
}
