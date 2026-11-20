import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/auth/perfil";
import { PerfilForm } from "./perfil-form";
import { UserRound } from "lucide-react";

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ acceso?: string }> }) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  const { acceso } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Mi perfil</h1>
          <p className="text-xs text-white/40">Actualiza tu nombre y contraseña</p>
        </div>
      </div>

      {acceso === "denegado" && <p role="status" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-white/60">No tienes acceso a esa área. Usa el menú para abrir tus áreas disponibles o solicita el acceso a un administrador.</p>}
      <PerfilForm perfil={perfil} />
    </div>
  );
}
