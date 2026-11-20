"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(nueva: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof nueva !== "string" || nueva.length < 8 || nueva.length > 128) {
    return { ok: false, error: "La contraseña debe tener entre 8 y 128 caracteres" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });

  if (error) return { ok: false, error: "No se pudo actualizar la contraseña. El enlace puede haber vencido; solicita uno nuevo." };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
