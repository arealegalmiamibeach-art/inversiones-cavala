import { readJsonBody, RequestTooLargeError } from "@/lib/lector-ia/request";
import { browseLectorStoredFiles, requireLectorSession, searchLectorStoredFiles, type LectorFileBrowse } from "@/lib/lector-ia/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireLectorSession>>;
  try {
    session = await requireLectorSession();
  } catch {
    return Response.json({ error: "Lector IA no habilitado para este usuario" }, { status: 403 });
  }

  let body: { query?: unknown; browse?: unknown; type?: unknown; entity?: unknown; date?: unknown; limit?: unknown };
  try {
    body = await readJsonBody<typeof body>(request, 4 * 1024);
  } catch (error) {
    return Response.json({ error: error instanceof RequestTooLargeError ? "Solicitud demasiado grande" : "Solicitud inválida" }, { status: error instanceof RequestTooLargeError ? 413 : 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 240) : "";
  const browse = body.browse === true;
  if (!query && !browse) return Response.json({ error: "Indica qué archivo buscas" }, { status: 400 });

  try {
    if (browse) {
      const allowedTypes = new Set(["all", "pdf", "word", "image", "text"]);
      const allowedDates = new Set(["all", "30d", "year"]);
      const options: LectorFileBrowse = {
        query,
        type: typeof body.type === "string" && allowedTypes.has(body.type) ? body.type as LectorFileBrowse["type"] : "all",
        entity: typeof body.entity === "string" ? body.entity.slice(0, 120) : "all",
        date: typeof body.date === "string" && allowedDates.has(body.date) ? body.date as LectorFileBrowse["date"] : "all",
        limit: typeof body.limit === "number" ? body.limit : 30,
      };
      return Response.json(await browseLectorStoredFiles(session.supabase, options), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ files: await searchLectorStoredFiles(session.supabase, query) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo buscar" }, { status: 500 });
  }
}
