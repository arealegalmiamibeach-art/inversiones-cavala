"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { eliminarRegistro } from "@/lib/actions/registros";

const LISTA_HREF: Record<string, string> = {
  propietarios: "/entidades/propietarios",
  predios: "/entidades/predios",
  vehiculos: "/entidades/vehiculos",
  concesiones_mineras: "/entidades/concesiones",
  personal: "/entidades/personal",
  oficinas_registrales: "/entidades/oficinas",
  procesos: "/procesos",
  contratos: "/contratos",
  documentos: "/documentos",
};

/** Acciones estándar de una fila: acceso a ficha y baja reversible. */
export function AccionesRegistro({
  href,
  clave,
  id,
  nombre,
  onEliminado,
}: {
  href: string;
  clave: string;
  id: string;
  nombre?: string;
  onEliminado?: () => void;
}) {
  return (
    <div className="flex min-w-max items-center justify-end gap-0.5">
      <Link href={href} className="text-xs font-medium text-brand-300 hover:text-brand-200">
        Ver →
      </Link>
      <EliminarRegistro
        clave={clave}
        id={id}
        nombre={nombre}
        modo="icono"
        onEliminado={onEliminado}
      />
    </div>
  );
}

/**
 * Baja reversible de un registro. Sólo es visible para `administrador` y pide
 * confirmación dentro de la interfaz. En modo icono cabe en una fila de tabla;
 * en modo zona se integra al pie de una ficha o panel lateral.
 */
export function EliminarRegistro({
  clave,
  id,
  nombre,
  modo = "zona",
  onEliminado,
}: {
  clave: string;
  id: string;
  nombre?: string;
  modo?: "zona" | "icono";
  /** Evita la navegación a la lista y permite cerrar un panel o refrescar una tabla. */
  onEliminado?: () => void;
}) {
  const rol = useAcceso(clave);
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  if (!puedeEscribir(rol) || !LISTA_HREF[clave]) return null;

  async function borrar() {
    setBorrando(true);
    setError(null);
    let resultado;
    try {
      resultado = await eliminarRegistro(clave, id);
    } catch {
      setBorrando(false);
      setError("No se pudo conectar con el servidor");
      return;
    }
    if (!resultado.ok) {
      setBorrando(false);
      setError(resultado.error);
      return;
    }
    setBorrando(false);
    setConfirmando(false);
    if (onEliminado) onEliminado();
    else router.push(LISTA_HREF[clave]);
    router.refresh();
  }

  const confirmacion = (
    <div className="rounded-lg border border-red-400/20 bg-red-500/[0.07] p-3">
      <p className="flex items-start gap-2 text-xs text-red-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Se enviará {nombre ? <strong>«{nombre}»</strong> : "este registro"} a la papelera.
          Podrá restaurarse mientras no se elimine definitivamente.
        </span>
      </p>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void borrar()}
          disabled={borrando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {borrando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Sí, eliminar
        </button>
        <button
          type="button"
          onClick={() => { setConfirmando(false); setError(null); }}
          disabled={borrando}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  if (modo === "icono") {
    return (
      <>
        <button
          type="button"
          title={`Eliminar ${nombre ?? "registro"}`}
          aria-label={`Eliminar ${nombre ?? "registro"}`}
          onClick={(evento) => {
            evento.stopPropagation();
            setError(null);
            setConfirmando(true);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-300/75 transition-colors hover:bg-red-500/15 hover:text-red-200"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {montado && confirmando && createPortal(
          <div data-entity-sheet-portal className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <button type="button" tabIndex={-1} aria-label="Cancelar eliminación" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => !borrando && setConfirmando(false)} />
            <div role="alertdialog" aria-modal="true" aria-label="Confirmar eliminación" className="relative w-full max-w-sm rounded-xl bg-[#0d0f18] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              {confirmacion}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div className="mt-6 border-t border-white/[0.06] pt-4">
      {!confirmando ? (
        <button
          type="button"
          onClick={() => { setConfirmando(true); setError(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/[0.07] px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar {nombre ? `«${nombre}»` : "este registro"}
        </button>
      ) : confirmacion}
      {error && !confirmando && (
        <p className="mt-2 text-[11px] text-red-300">{error}</p>
      )}
    </div>
  );
}
