import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la service-role key: SÓLO para procesos sin sesión de usuario
 * (el cron del correo diario). Salta el RLS, así que nunca debe tocar una
 * ruta que sirva contenido al navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
