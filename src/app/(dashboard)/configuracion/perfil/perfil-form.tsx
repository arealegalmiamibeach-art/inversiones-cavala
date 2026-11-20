"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2, KeyRound } from "lucide-react";
import { ROL_LABEL, type Rol } from "@/lib/auth/roles";
import type { Perfil } from "@/lib/auth/perfil";
import { actualizarNombrePropio, cambiarContrasenaPropia } from "./actions";
import { cn } from "@/lib/utils";

type Flash = { tipo: "ok" | "error"; texto: string };

export function PerfilForm({ perfil }: { perfil: Perfil }) {
  const [nombre, setNombre] = useState(perfil.nombre ?? "");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);
  const [pending, startTransition] = useTransition();

  function mostrar(f: Flash) {
    setFlash(f);
    setTimeout(() => setFlash(null), 4000);
  }

  function handleNombre(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await actualizarNombrePropio(nombre);
        mostrar(res.ok ? { tipo: "ok", texto: "Nombre actualizado" } : { tipo: "error", texto: res.error ?? "Error" });
      } catch {
        mostrar({ tipo: "error", texto: "No se pudo guardar. Revisa tu conexión e intenta nuevamente." });
      }
    });
  }

  function handleContrasena(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== confirmar) {
      mostrar({ tipo: "error", texto: "Las contraseñas no coinciden" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await cambiarContrasenaPropia(nueva);
        if (res.ok) {
          setNueva("");
          setConfirmar("");
          mostrar({ tipo: "ok", texto: "Contraseña actualizada" });
        } else {
          mostrar({ tipo: "error", texto: res.error ?? "Error" });
        }
      } catch {
        mostrar({ tipo: "error", texto: "No se pudo actualizar. Revisa tu conexión e intenta nuevamente." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div role={flash.tipo === "error" ? "alert" : "status"} className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium",
          flash.tipo === "ok"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        )}>
          {flash.tipo === "ok" ? <Check aria-hidden="true" className="h-4 w-4" /> : <X aria-hidden="true" className="h-4 w-4" />}
          {flash.texto}
        </div>
      )}

      {/* Datos de cuenta (solo lectura) */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Cuenta</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/30">Correo</p>
            <p className="mt-1 text-sm text-white/70">{perfil.correo ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/30">Rol</p>
            <p className="mt-1 text-sm text-white/70">{perfil.rol ? ROL_LABEL[perfil.rol as Rol] : "—"}</p>
          </div>
        </div>
      </div>

      {/* Nombre */}
      <form onSubmit={handleNombre} className="glass-panel rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Nombre visible</h2>
        <div className="flex gap-2">
          <input
            id="nombre-perfil"
            type="text"
            aria-label="Nombre visible"
            maxLength={120}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre completo"
            className="view-control flex-1"
          />
          <button
            type="submit"
            disabled={pending || nombre === (perfil.nombre ?? "")}
            aria-busy={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
          >
          {pending && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </button>
        </div>
      </form>

      {/* Contraseña */}
      <form onSubmit={handleContrasena} className="glass-panel rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Cambiar contraseña</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nueva-contrasena-perfil" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/30">
              Nueva contraseña
            </label>
            <input
              id="nueva-contrasena-perfil"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className="view-control w-full"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label htmlFor="confirmar-contrasena-perfil" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/30">
              Confirmar contraseña
            </label>
            <input
              id="confirmar-contrasena-perfil"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className="view-control w-full"
              placeholder="••••••••"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending || !nueva || !confirmar}
          aria-busy={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-40"
        >
          {pending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />}
          Cambiar contraseña
        </button>
      </form>
    </div>
  );
}
