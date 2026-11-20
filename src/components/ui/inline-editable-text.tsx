"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, PanelRightOpen } from "lucide-react";
import { actualizarCampo } from "@/lib/actions/entidades";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { useFormatoCelda } from "./formato-celda";

interface InlineEditableTextProps {
  tabla: string;
  id: string;
  campo: string;
  valorInicial: string | null | undefined;
  revalidar: string;
  placeholder?: string;
  className?: string;
  inputType?: "text" | "number" | "date";
  min?: string | number;
  max?: string | number;
  step?: string | number;
  /** Permite conservar el formato de lectura (moneda, fecha, badge, etc.). */
  renderValor?: (valor: string) => React.ReactNode;
  /** En la propiedad principal ofrece acceso explícito al panel lateral. */
  onOpen?: () => void;
  /** Crea `datos_empresas` al escribir el primer dato fiscal del propietario. */
  propietarioId?: string;
}

/**
 * Texto que se ve como texto plano y solo se convierte en un campo editable
 * al hacer clic (como una celda de Notion/Airtable) — a diferencia de
 * `EditableText`, que siempre muestra un input.
 */
export function InlineEditableText({
  tabla,
  id,
  campo,
  valorInicial,
  revalidar,
  placeholder,
  className,
  inputType = "text",
  min,
  max,
  step,
  renderValor,
  onOpen,
  propietarioId,
}: InlineEditableTextProps) {
  const rol = useAcceso(tabla);
  const formatoCelda = useFormatoCelda();
  const soloLectura = !puedeEscribir(rol);
  const [valor, setValor] = useState(valorInicial ?? "");
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autoguardado sin confirmación: `ultimoGuardado` marca lo último que llegó a
  // la base y `valorActual` conserva el texto para poder enviarlo aunque el
  // panel se cierre (desmontaje) antes de que salte el debounce.
  const ultimoGuardado = useRef(valorInicial ?? "");
  const valorActual = useRef(valor);

  useEffect(() => {
    valorActual.current = valor;
  });

  useEffect(() => {
    if ((valorInicial ?? "") === ultimoGuardado.current) return;
    setValor(valorInicial ?? "");
    ultimoGuardado.current = valorInicial ?? "";
  }, [valorInicial]);

  useEffect(() => {
    if (!editando || !textareaRef.current) return;
    const el = textareaRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editando]);

  const persistir = useCallback((texto: string) => {
    if (soloLectura || texto === ultimoGuardado.current) return;
    const anterior = ultimoGuardado.current;
    ultimoGuardado.current = texto;
    startTransition(async () => {
      try {
        const res = await actualizarCampo(tabla, id, campo, texto || null, revalidar, propietarioId);
        if (!("error" in res)) { window.dispatchEvent(new Event("registros-actualizados")); return; }
        ultimoGuardado.current = anterior;
        setValor(anterior);
        setError(res.code === "42501" ? "Sin permiso" : res.error);
      } catch {
        ultimoGuardado.current = anterior;
        setValor(anterior);
        setError("No se pudo guardar");
      }
      setTimeout(() => setError(null), 3000);
    });
  }, [soloLectura, tabla, id, campo, revalidar, propietarioId]);

  useEffect(() => {
    if (soloLectura || valor === ultimoGuardado.current) return;
    const temporizador = window.setTimeout(() => persistir(valor), 700);
    return () => window.clearTimeout(temporizador);
  }, [valor, soloLectura, persistir]);

  useEffect(() => {
    if (soloLectura) return;
    const destino = { tabla, id, campo, revalidar };
    return () => {
      const pendiente = valorActual.current;
      if (pendiente === ultimoGuardado.current) return;
      ultimoGuardado.current = pendiente;
      void actualizarCampo(destino.tabla, destino.id, destino.campo, pendiente || null, destino.revalidar, propietarioId);
    };
  }, [soloLectura, tabla, id, campo, revalidar, propietarioId]);

  function guardar() {
    setEditando(false);
    persistir(valorActual.current);
  }

  function contenido(valorMostrado: string) {
    if (!valorMostrado) return <span className="text-white/35">{placeholder ?? "—"}</span>;
    return formatoCelda ? formatoCelda(valorMostrado) : renderValor ? renderValor(valorMostrado) : valorMostrado;
  }

  if (soloLectura) {
    return (
      <div role="presentation" className="group/open flex min-w-0 items-start gap-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <span className={`min-w-0 flex-1 ${className ?? ""}`}>{contenido(valorInicial ?? "")}</span>
        {onOpen && <BotonAbrirPanel onOpen={onOpen} />}
      </div>
    );
  }

  if (!editando) {
    return (
      <div role="presentation" className="min-w-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <div className="group/open flex min-w-0 items-start gap-1">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditando(true);
            }}
            className={`block min-w-0 flex-1 cursor-text rounded px-1 py-0.5 text-left outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-brand-400/50 ${pending ? "opacity-60" : ""} ${className ?? ""}`}
          >
            {contenido(valor)}
          </button>
          {pending && <Loader2 aria-label="Guardando" className="mt-1 h-3 w-3 shrink-0 animate-spin text-white/45" />}
          {onOpen && <BotonAbrirPanel onOpen={onOpen} />}
        </div>
        {error && <p role="alert" className="mt-1 text-[10px] text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <div role="presentation" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {inputType === "text" ? (
        <textarea
          ref={textareaRef}
          value={valor}
          onChange={(event) => {
            valorActual.current = event.target.value;
            setValor(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onBlur={guardar}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Vuelve a lo último confirmado por el servidor, no a la prop: con
              // autoguardado la prop puede estar por detrás de lo ya escrito.
              // `preventDefault` avisa al panel lateral que este Escape ya se
              // usó (cancelar la edición) y no debe cerrarlo.
              event.preventDefault();
              setValor(ultimoGuardado.current);
              setEditando(false);
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.blur();
            }
          }}
          rows={1}
          aria-label={campo.replaceAll("_", " ")}
          aria-invalid={Boolean(error)}
          className="glass-input w-full resize-none"
        />
      ) : (
        <input
          autoFocus
          type={inputType}
          aria-label={campo.replaceAll("_", " ")}
          aria-invalid={Boolean(error)}
          value={valor}
          min={min}
          max={max}
          step={step}
          onChange={(event) => { valorActual.current = event.target.value; setValor(event.target.value); }}
          onBlur={guardar}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setValor(ultimoGuardado.current);
              setEditando(false);
            }
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="glass-input min-w-[145px]"
        />
      )}
      {error && <p role="alert" className="mt-1 text-[10px] text-red-300">{error}</p>}
    </div>
  );
}

function BotonAbrirPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      title="Abrir vista lateral"
      aria-label="Abrir vista lateral"
      className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.18] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 opacity-0 transition-all hover:border-white/30 hover:bg-white/[0.1] hover:text-white group-hover/row:opacity-100 group-hover/open:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400/50"
    >
      <PanelRightOpen className="h-3 w-3" />
      Abrir
    </button>
  );
}
