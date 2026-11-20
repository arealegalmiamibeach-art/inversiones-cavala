import "server-only";

import { cache } from "react";
import { getAlertas } from "@/lib/alertas";
import { createClient } from "@/lib/supabase/server";

/** Comparte la consulta de alertas entre layout y página durante un render. */
export const getAlertasActuales = cache(async () => {
  const supabase = await createClient();
  return getAlertas(supabase);
});
