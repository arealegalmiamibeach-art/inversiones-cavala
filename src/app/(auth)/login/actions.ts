"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/auth/destino";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128
  ) {
    return { error: "Invalid login credentials" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return {
      error: error.message === "Invalid login credentials"
        ? "Invalid login credentials"
        : "No se pudo iniciar sesión. Inténtalo nuevamente.",
    };
  }

  revalidatePath("/", "layout");
  // Vuelve a la página que se intentó abrir (p. ej. el enlace de una alerta
  // del correo). `destinoSeguro` descarta cualquier dirección externa.
  redirect(destinoSeguro(formData.get("next")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
