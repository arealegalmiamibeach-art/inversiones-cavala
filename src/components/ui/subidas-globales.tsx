"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Info, Loader2, X } from "lucide-react";
import { MAX_ARCHIVO_BYTES, MENSAJE_LIMITE_ARCHIVO, mimePermitido, subirArchivo, type ArchivoSubido } from "@/lib/archivos/subir";
import { marcarSelectorArchivoAbierto } from "@/lib/archivos/selector-nativo";
import { leerArrastre } from "@/lib/archivos/arrastre";

/**
 * Dónde cae el archivo y a quién avisarle cuando termina. Lo arma el botón
 * que dispara la subida y se guarda en un ref del proveedor, no en el estado
 * del botón: el botón puede desaparecer mientras el diálogo del sistema está
 * abierto y la subida tiene que seguir igual.
 */
export type DestinoSubida = {
  entidadTipo: string;
  entidadId: string;
  /** Ruta de carpeta ya resuelta; sin ella, el archivo queda en la raíz. */
  carpeta?: string;
  onSubido?: (archivo: ArchivoSubido) => void;
};

type EnCurso = { clave: string; nombre: string; progreso: number };
type Fallida = { clave: string; nombre: string; mensaje: string };
/** Subidas que terminaron bien pero no crearon nada nuevo (el archivo ya estaba). */
type Aviso = { clave: string; nombre: string; mensaje: string };

type ApiSubidas = {
  /** Abre el selector nativo del sistema y sube lo que se elija a `destino`. */
  abrirSelector: (destino: DestinoSubida) => void;
  /**
   * Abre el selector nativo y entrega lo elegido sin subirlo, para cuando el
   * destino todavía no existe (p. ej. el documento se crea recién con el
   * nombre del primer archivo). Usa el mismo input de aquí arriba, así que
   * sobrevive a que el menú que lo pidió se cierre o se desmonte.
   */
  elegirArchivos: (alElegir: (archivos: File[]) => void) => void;
  /** Sube archivos ya obtenidos (arrastrar y soltar). */
  subir: (archivos: FileList | File[], destino: DestinoSubida) => void;
  /**
   * Sube lo soltado desde el Explorador/Finder, carpetas incluidas: cada
   * archivo cae en la misma estructura de carpetas (debajo de
   * `destino.carpeta`, si lo hay). Llamarla directo en el `onDrop`.
   */
  subirArrastre: (dataTransfer: DataTransfer, destino: DestinoSubida) => void;
};

const SubidasContext = createContext<ApiSubidas | null>(null);

export function useSubidas(): ApiSubidas {
  const api = useContext(SubidasContext);
  if (!api) throw new Error("useSubidas necesita <SubidasProvider> (va en el layout del dashboard)");
  return api;
}

/**
 * Dueño único del `<input type="file">` de toda la app, montado en el layout.
 *
 * Antes cada botón de subir renderizaba su propio input dentro del menú
 * desplegable o del panel lateral donde vivía. Al abrirse el diálogo nativo
 * del sistema el navegador quita el foco de la página, y eso bastaba para que
 * el menú (o el panel entero) se cerrara y React desmontara ese input: cuando
 * el usuario terminaba de elegir el archivo, el evento `change` caía sobre un
 * elemento que ya no estaba en el árbol, así que no se subía nada ni se veía
 * ningún error — la subida moría en silencio.
 *
 * Con el input y el progreso aquí arriba, nada de lo que pase con paneles,
 * menús o navegación puede interrumpir una subida en curso.
 */
export function SubidasProvider({ children }: { children: React.ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const destinoRef = useRef<DestinoSubida | null>(null);
  const alElegirRef = useRef<((archivos: File[]) => void) | null>(null);
  const [enCurso, setEnCurso] = useState<EnCurso[]>([]);
  const [fallidas, setFallidas] = useState<Fallida[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  function avisar(aviso: Aviso) {
    setAvisos((actuales) => [...actuales, aviso]);
    setTimeout(() => setAvisos((actuales) => actuales.filter((a) => a.clave !== aviso.clave)), 6000);
  }

  async function subir(archivos: FileList | File[], destino: DestinoSubida) {
    for (const file of Array.from(archivos)) {
      const clave = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!mimePermitido(file.type)) {
        setFallidas((actuales) => [...actuales, { clave, nombre: file.name, mensaje: "Formato no permitido" }]);
        continue;
      }
      if (file.size > MAX_ARCHIVO_BYTES) {
        setFallidas((actuales) => [...actuales, { clave, nombre: file.name, mensaje: MENSAJE_LIMITE_ARCHIVO }]);
        continue;
      }

      setEnCurso((actuales) => [...actuales, { clave, nombre: file.name, progreso: 0 }]);
      try {
        const archivo = await subirArchivo(file, {
          entidadTipo: destino.entidadTipo,
          entidadId: destino.entidadId,
          origen: "app",
          carpeta: destino.carpeta,
          onProgress: (pct) =>
            setEnCurso((actuales) => actuales.map((s) => (s.clave === clave ? { ...s, progreso: pct } : s))),
        });
        destino.onSubido?.(archivo);
        if (archivo.yaExistia) {
          avisar({
            clave,
            nombre: file.name,
            mensaje: archivo.movido
              ? "Este archivo ya estaba en la ficha; se movió a la carpeta elegida"
              : "Este archivo ya estaba en la ficha; no se agregó otra copia",
          });
        }
      } catch (err) {
        setFallidas((actuales) => [
          ...actuales,
          { clave, nombre: file.name, mensaje: err instanceof Error ? err.message : "No se pudo subir el archivo" },
        ]);
      } finally {
        setEnCurso((actuales) => actuales.filter((s) => s.clave !== clave));
      }
    }
  }

  async function subirArrastre(dataTransfer: DataTransfer, destino: DestinoSubida) {
    // `leerArrastre` captura las entradas ya, antes del primer `await`.
    const lectura = leerArrastre(dataTransfer);
    let lista;
    try {
      lista = await lectura;
    } catch {
      const clave = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setFallidas((actuales) => [...actuales, { clave, nombre: "Carpeta", mensaje: "No se pudo leer la carpeta soltada" }]);
      return;
    }

    // Un lote por carpeta de destino, porque `subir` recibe una sola carpeta.
    const porCarpeta = new Map<string, File[]>();
    for (const { file, carpetaRelativa } of lista) {
      const carpeta = [destino.carpeta, carpetaRelativa].filter(Boolean).join("/");
      const lote = porCarpeta.get(carpeta) ?? [];
      lote.push(file);
      porCarpeta.set(carpeta, lote);
    }
    for (const [carpeta, archivos] of porCarpeta) {
      await subir(archivos, { ...destino, carpeta: carpeta || undefined });
    }
  }

  function abrirSelector(destino: DestinoSubida) {
    alElegirRef.current = null;
    destinoRef.current = destino;
    marcarSelectorArchivoAbierto();
    inputRef.current?.click();
  }

  function elegirArchivos(alElegir: (archivos: File[]) => void) {
    destinoRef.current = null;
    alElegirRef.current = alElegir;
    marcarSelectorArchivoAbierto();
    inputRef.current?.click();
  }

  return (
    <SubidasContext.Provider value={{ abrirSelector, elegirArchivos, subir, subirArrastre }}>
      {children}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(evento) => {
          // Copia antes de vaciar el input: la FileList queda vacía al resetearlo.
          const archivos = Array.from(evento.target.files ?? []);
          const alElegir = alElegirRef.current;
          const destino = destinoRef.current;
          alElegirRef.current = null;
          if (archivos.length > 0) {
            if (alElegir) alElegir(archivos);
            else if (destino) void subir(archivos, destino);
          }
          evento.target.value = "";
        }}
      />
      {(enCurso.length > 0 || fallidas.length > 0 || avisos.length > 0) && (
        <div className="fixed bottom-4 right-4 z-[200] w-72 space-y-2">
          {enCurso.map((archivo) => (
            <div key={archivo.clave} className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#151720]/95 px-3 py-2 text-[11px] text-white/75 shadow-[0_8px_30px_rgba(0,0,0,.5)] backdrop-blur-xl">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-300" />
              <span className="min-w-0 flex-1 truncate">{archivo.nombre}</span>
              <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-400 transition-[width]" style={{ width: `${archivo.progreso}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-white/45">{archivo.progreso}%</span>
            </div>
          ))}
          {avisos.map((aviso) => (
            <div key={aviso.clave} role="status" className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-[#1d1a12]/95 px-3 py-2 text-[11px] text-amber-100 shadow-[0_8px_30px_rgba(0,0,0,.5)] backdrop-blur-xl">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{aviso.nombre}</span>
                <span className="block text-amber-200/85">{aviso.mensaje}</span>
              </span>
              <button
                type="button"
                onClick={() => setAvisos((actuales) => actuales.filter((a) => a.clave !== aviso.clave))}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded p-0.5 text-amber-300 transition-colors hover:bg-amber-500/15 hover:text-amber-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {fallidas.map((archivo) => (
            <div key={archivo.clave} className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-[#1d1216]/95 px-3 py-2 text-[11px] text-red-200 shadow-[0_8px_30px_rgba(0,0,0,.5)] backdrop-blur-xl">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{archivo.nombre}</span>
                <span className="block text-red-300/85">{archivo.mensaje}</span>
              </span>
              <button
                type="button"
                onClick={() => setFallidas((actuales) => actuales.filter((f) => f.clave !== archivo.clave))}
                aria-label="Descartar error"
                className="shrink-0 rounded p-0.5 text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SubidasContext.Provider>
  );
}
