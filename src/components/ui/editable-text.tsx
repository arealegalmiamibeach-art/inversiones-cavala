"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { actualizarCampo } from "@/lib/actions/entidades";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

interface EditableTextProps {
  tabla: string;
  id: string;
  campo: string;
  valorInicial: string | null | undefined;
  revalidar: string;
  multiline?: boolean;
  inputType?: React.HTMLInputTypeAttribute;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  placeholder?: string;
  label?: string;
  appearance?: "field" | "title" | "table-title";
  /** Crea `datos_empresas` al escribir el primer dato fiscal del propietario. */
  propietarioId?: string;
}

export function EditableText({
  tabla,
  id,
  campo,
  valorInicial,
  revalidar,
  multiline,
  inputType = "text",
  min,
  max,
  step,
  placeholder,
  label,
  appearance = "field",
  propietarioId,
}: EditableTextProps) {
  const rol = useAcceso(tabla);
  const soloLectura = !puedeEscribir(rol);
  const [valor, setValor] = useState(valorInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autoguardado sin confirmación: se compara siempre contra lo último que se
  // llegó a escribir en la base, no contra la prop, para absorber el eco del
  // revalidatePath y no pisar lo que el usuario sigue tecleando.
  const ultimoGuardado = useRef(valorInicial ?? "");
  const valorActual = useRef(valor);
  const idAnterior = useRef(id);
  const tituloRef = useRef<HTMLTextAreaElement>(null);
  const controlId = useId();
  const estadoId = `${controlId}-estado`;
  const etiquetaControl = label ?? campo.replaceAll("_", " ");

  useEffect(() => {
    valorActual.current = valor;
  });

  useEffect(() => {
    if (appearance === "field" || !tituloRef.current) return;
    tituloRef.current.style.height = "0px";
    tituloRef.current.style.height = `${tituloRef.current.scrollHeight}px`;
  }, [appearance, valor]);

  useEffect(() => {
    const cambioDeRegistro = idAnterior.current !== id;
    idAnterior.current = id;
    if (!cambioDeRegistro && (valorInicial ?? "") === ultimoGuardado.current) return;
    setValor(valorInicial ?? "");
    ultimoGuardado.current = valorInicial ?? "";
    setError(null);
  }, [valorInicial, id]);

  const guardar = useCallback(async (texto: string) => {
    if (soloLectura || texto === ultimoGuardado.current) return;
    const anterior = ultimoGuardado.current;
    ultimoGuardado.current = texto;
    setGuardando(true);
    setError(null);
    try {
      const res = await actualizarCampo(tabla, id, campo, texto || null, revalidar, propietarioId);
      if ("error" in res) {
        ultimoGuardado.current = anterior;
        setError(res.code === "42501" ? "Sin permiso para editar" : res.error);
        return;
      }
      setGuardado(true);
      window.dispatchEvent(new Event("registros-actualizados"));
      window.setTimeout(() => setGuardado(false), 1500);
    } catch {
      ultimoGuardado.current = anterior;
      setError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }, [soloLectura, tabla, id, campo, revalidar, propietarioId]);

  useEffect(() => {
    if (soloLectura || valor === ultimoGuardado.current) return;
    const temporizador = window.setTimeout(() => void guardar(valor), 700);
    return () => window.clearTimeout(temporizador);
  }, [valor, soloLectura, guardar]);

  // Si el panel se cierra (o la pestaña se oculta) con cambios sin enviar, se
  // vacían aquí: el destino queda capturado del render que creó el efecto.
  useEffect(() => {
    if (soloLectura) return;
    const destino = { tabla, id, campo, revalidar };
    function enviarPendiente() {
      const pendiente = valorActual.current;
      if (pendiente === ultimoGuardado.current) return;
      ultimoGuardado.current = pendiente;
      void actualizarCampo(destino.tabla, destino.id, destino.campo, pendiente || null, destino.revalidar, propietarioId);
    }
    function alOcultar() {
      if (document.visibilityState === "hidden") enviarPendiente();
    }
    window.addEventListener("pagehide", enviarPendiente);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", enviarPendiente);
      document.removeEventListener("visibilitychange", alOcultar);
      enviarPendiente();
    };
  }, [soloLectura, tabla, id, campo, revalidar, propietarioId]);

  const comunes = {
    id: controlId,
    value: valor,
    placeholder,
    disabled: soloLectura,
    "aria-label": label ? undefined : etiquetaControl,
    "aria-invalid": Boolean(error),
    "aria-describedby": guardando || guardado || error ? estadoId : undefined,
    onChange: (evento: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { valorActual.current = evento.target.value; setValor(evento.target.value); },
    onBlur: () => void guardar(valorActual.current),
  };

  if (appearance !== "field") {
    const esTituloPrincipal = appearance === "title";
    return (
      <div role="presentation" className="relative min-w-0" onClick={(evento) => evento.stopPropagation()} onKeyDown={(evento) => evento.stopPropagation()}>
        <textarea
          ref={tituloRef}
          value={valor}
          rows={1}
          maxLength={240}
          placeholder={placeholder}
          disabled={soloLectura}
          aria-label={label ?? (esTituloPrincipal ? "Título" : "Título del registro")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? estadoId : undefined}
          onChange={(evento) => { valorActual.current = evento.target.value.replace(/[\r\n]+/g, " "); setValor(valorActual.current); }}
          onBlur={(evento) => void guardar(evento.currentTarget.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") {
              evento.preventDefault();
              evento.currentTarget.blur();
            }
          }}
          className={esTituloPrincipal
            ? "-ml-2 block w-[calc(100%+0.5rem)] resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 pr-7 text-[22px] font-bold leading-[1.18] tracking-[-0.025em] text-white outline-none transition-colors placeholder:text-white/35 hover:bg-white/[0.035] focus:border-brand-400/30 focus:bg-white/[0.045] focus:ring-1 focus:ring-brand-400/25 disabled:cursor-default sm:text-[26px]"
            : "-my-1 -ml-1 block min-h-7 w-full min-w-[180px] resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1 py-1 pr-6 text-[13px] font-medium leading-5 text-white/95 outline-none transition-colors placeholder:text-white/35 hover:bg-white/[0.04] focus:border-brand-400/30 focus:bg-white/[0.05] focus:ring-1 focus:ring-brand-400/25 disabled:cursor-default"
          }
        />
        {guardando && <Loader2 className="absolute right-1.5 top-2 h-3 w-3 animate-spin text-white/50" />}
        {!guardando && guardado && !error && <Check className="absolute right-1.5 top-2 h-3 w-3 text-emerald-300" />}
        {error && (
          <p id={estadoId} role="alert" className="mt-1 flex items-center gap-2 text-[11px] text-red-300">
            {error}
            <button type="button" onClick={() => void guardar(valorActual.current)} className="text-white/70 underline underline-offset-2 hover:text-white">
              Reintentar
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && (
        <label htmlFor={controlId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/65">{label}</label>
      )}
      {multiline ? (
        <textarea {...comunes} rows={4} className="glass-input resize-none disabled:cursor-default disabled:opacity-70" />
      ) : (
        <input
          {...comunes}
          type={inputType}
          min={min}
          max={max}
          step={step}
          className="glass-input disabled:cursor-default disabled:opacity-70"
        />
      )}
      {guardando && (
        <p id={estadoId} role="status" className="mt-1 flex items-center gap-1 text-[11px] text-white/55"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</p>
      )}
      {!guardando && guardado && !error && (
        <p id={estadoId} role="status" className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300"><Check className="h-3 w-3" /> Guardado</p>
      )}
      {error && (
        <p id={estadoId} role="alert" className="mt-1 flex items-center gap-2 text-[11px] text-red-300">
          {error}
          <button type="button" onClick={() => void guardar(valorActual.current)} className="text-white/70 underline underline-offset-2 hover:text-white">
            Reintentar
          </button>
        </p>
      )}
    </div>
  );
}
