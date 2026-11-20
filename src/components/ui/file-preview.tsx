"use client";

import { createContext, forwardRef, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  Music2,
  Paperclip,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { cn } from "@/lib/utils";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { useSubidas } from "@/components/ui/subidas-globales";
import { crearCarpetaArchivo, eliminarCarpetaVacia, moverArchivoACarpeta, reordenarArchivos, reubicarCarpeta } from "@/lib/actions/carpetas";

export interface Archivo {
  id: string;
  nombre_original: string;
  mime?: string | null;
  tamano_bytes: number;
  subido_en?: string | null;
  /** Ruta de carpeta anidada (separador "/"), p. ej. "SOAT/AGOSTO 2024". `null`/ausente = suelto en la raíz. */
  carpeta?: string | null;
  /** Posición manual dentro de su carpeta; `null`/ausente = sin ordenar (va al final). */
  orden?: number | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string) {
  return name.includes(".") ? name.split(".").pop()?.toLocaleUpperCase("es-PE") ?? "ARCHIVO" : "ARCHIVO";
}

function fileKind(mime?: string | null) {
  if (mime?.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime?.startsWith("text/")) return "text";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  return "file";
}

export function canPreview(archivo: Archivo) {
  return fileKind(archivo.mime) !== "file";
}

/**
 * Al elegir un archivo en el selector nativo del sistema operativo, Chrome
 * devuelve el foco a la página disparando un "pointerdown" (y a veces un
 * focus) fantasma sobre el fondo. Radix lo lee como un click afuera y cierra
 * — desmonta — el menú antes de que el `<input>` procese el archivo elegido,
 * así que "Subir archivos" no hacía nada. Los `DropdownMenuContent` que
 * envuelven un uploader pasan esto en `onPointerDownOutside`/`onFocusOutside`
 * para que sólo se cierren por su botón o Escape.
 */
export function evitarCierrePorSelectorDeArchivo(event: Event) {
  event.preventDefault();
}

/**
 * Tarjeta plegable de adjuntos con el mismo patrón visual que las categorías
 * del panel "Documentos y relaciones" de Propietarios: borde sutil, cabecera
 * con ícono + título + contador en píldora + chevron, y cuerpo colapsable con
 * animación grid-rows. La usan `EntityFileBlocks` (con cabecera visible) y
 * cualquier sheet que quiera mostrar adjuntos con ese mismo estilo.
 */
export function SeccionAdjuntos({
  titulo = "Archivos adjuntos",
  count,
  defaultOpen = false,
  onAgregar,
  menuAgregar,
  children,
}: {
  titulo?: string;
  count: number;
  defaultOpen?: boolean;
  /** Acción rápida `+` del encabezado; también abre la tarjeta. */
  onAgregar?: () => void;
  /**
   * Reemplaza `onAgregar`: el `+` abre un menú desplegable con este
   * contenido en vez de disparar una sola acción directa. Se usa cuando
   * "agregar" implica elegir entre más de una cosa (documento vs.
   * subcarpeta), para no tener que mostrar ambas opciones siempre
   * desplegadas ocupando espacio permanente.
   */
  menuAgregar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/10">
      <div className="flex w-full items-center gap-1 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="group/titulo flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <Paperclip className="h-4 w-4 shrink-0 text-white/45 transition-colors group-hover/titulo:text-white/70" />
          <span className="flex-1 truncate text-[12.5px] font-semibold text-white/85 transition-colors group-hover/titulo:text-white">{titulo}</span>
          <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{count}</span>
        </button>
        {menuAgregar ? (
          <DropdownMenu modal={false} onOpenChange={(open) => open && setAbierto(true)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`Agregar a ${titulo.toLocaleLowerCase("es-PE")}`}
                aria-label={`Agregar a ${titulo.toLocaleLowerCase("es-PE")}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="end"
              className="z-[101] w-60 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              {menuAgregar}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : onAgregar && (
          <button
            type="button"
            onClick={() => {
              setAbierto(true);
              onAgregar();
            }}
            title={`Agregar a ${titulo.toLocaleLowerCase("es-PE")}`}
            aria-label={`Agregar a ${titulo.toLocaleLowerCase("es-PE")}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-label={abierto ? `Contraer ${titulo}` : `Expandir ${titulo}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-white/40 transition-colors hover:text-white"
        >
          <TrianguloDesplegable abierto={abierto} />
        </button>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function formatFechaSubida(iso?: string | null) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Tabla de adjuntos con el mismo patrón que las categorías del panel
 * "Documentos y relaciones": columnas NOMBRE / FECHA / DETALLE, filas con
 * chevron que despliegan la vista previa embebida, acciones en la última
 * columna y una zona de subida permanente al pie.
 */
export function AdjuntosTabla({
  archivos,
  entidadTipo,
  entidadId,
  permitirSubida = true,
  onSubido,
  onEliminado,
  subirArchivosRef,
}: {
  archivos: Archivo[];
  entidadTipo: string;
  entidadId: string;
  permitirSubida?: boolean;
  onSubido?: (archivo: Archivo) => void;
  onEliminado?: (id: string) => void;
  subirArchivosRef?: React.Ref<SubirArchivosHandle>;
}) {
  const rol = useAcceso(entidadTipo);
  const puedeAdministrar = permitirSubida && (puedeEscribir(rol) && puedeEscribir(rol, "documentos"));

  return (
    <div className="border-t border-white/[0.06]">
      <div className="scrollbar-glass overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-[11.5px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="px-3 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {archivos.map((archivo) => (
              <FilaAdjunto
                key={archivo.id}
                archivo={archivo}
                onEliminado={puedeAdministrar ? onEliminado : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
      {permitirSubida && (
        <div className="border-t border-white/[0.06] p-3">
          <SubirArchivos
            ref={subirArchivosRef}
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            onSubido={onSubido}
            etiqueta="+ Agregar archivo"
          />
        </div>
      )}
    </div>
  );
}

function FilaAdjunto({
  archivo,
  onEliminado,
}: {
  archivo: Archivo;
  onEliminado?: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const previewable = canPreview(archivo);

  return (
    <>
      <tr className="glass-row">
        <td className="px-3 py-2 text-white/80">
          <span className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAbierto((a) => !a)}
              aria-expanded={abierto}
              aria-label={abierto ? "Ocultar vista previa" : "Mostrar vista previa"}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <TrianguloDesplegable abierto={abierto} />
            </button>
            <span className="min-w-0 truncate font-medium text-white/90">{archivo.nombre_original}</span>
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-white/75">{formatFechaSubida(archivo.subido_en) ?? "—"}</td>
        <td className="px-3 py-2 text-white/80">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{archivo.tamano_bytes ? formatBytes(archivo.tamano_bytes) : "—"}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              {previewable && (
                <WindowAction label="Ampliar dentro del panel" onClick={() => { setAbierto(true); setMaximizado(true); }}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </WindowAction>
              )}
              <a
                href={`/api/archivos/${archivo.id}`}
                target="_blank"
                rel="noreferrer"
                title="Descargar archivo"
                aria-label="Descargar archivo"
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {onEliminado && <DeleteFileButton archivoId={archivo.id} onEliminado={() => onEliminado(archivo.id)} />}
            </div>
          </div>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={3} className="border-t border-white/[0.05] bg-black/20 px-3 py-3">
            <div className="pl-6">
              <FilePreviewDesnuda archivo={archivo} maximizado={maximizado} onCerrarMaximizado={() => setMaximizado(false)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export type EntityFileBlocksHandle = {
  agregar: (archivo: Archivo) => void;
  agregarCarpeta: (ruta: string) => void;
};

export const EntityFileBlocks = forwardRef<EntityFileBlocksHandle, {
  entidadTipo: string;
  entidadId: string | null | undefined;
  permitirSubida?: boolean;
  vacioMensaje?: string;
  /** Título de la tarjeta plegable; por defecto "Archivos adjuntos". */
  titulo?: string;
  /** Mantiene visible el cargador al entrar al panel o ficha. */
  defaultOpen?: boolean;
  /**
   * Cuando es `false`, sólo trae los archivos colgados directo de esta
   * entidad (sin el segundo salto por `vinculos` a `documentos`). Lo usa el
   * panel de "Documentos y relaciones" para la categoría "Archivos" (los
   * adjuntos directos), porque los archivos de documentos vinculados ya se
   * muestran cada uno en su propia categoría por tipo — sin esto saldrían
   * duplicados.
   */
  incluirDocumentosVinculados?: boolean;
  /**
   * Cuando es `true`, omite el bloque de icono + "Archivos adjuntos (N)" y
   * va directo a la lista. Lo usa el panel de "Documentos y relaciones"
   * (nivel 3): ahí el nombre del documento ya se ve en la fila que contiene
   * este bloque, así que el título repetido no aporta.
   */
  ocultarEncabezado?: boolean;
  /**
   * Deja elegir/crear una carpeta al subir (con sugerencias de las ya
   * usadas aquí) y agrupa los adjuntos existentes en un árbol de carpetas
   * plegables en vez de la tabla plana de siempre.
   */
  permitirCarpetas?: boolean;
  /** Panel angosto (sheet lateral): fuerza 2 carpetas por fila en vez de repartir por ancho disponible. */
  vistaLateral?: boolean;
  /**
   * Cuando está vacío, muestra sólo el mensaje (mismo estilo que "Aún no hay
   * nada vinculado aquí" en las demás categorías) en vez del recuadro con
   * ícono + botón "+ Agregar". Úsalo cuando ya existe un "+" externo para
   * agregar (p. ej. el encabezado de la categoría "Archivos"), para no
   * duplicar la acción.
   */
  ocultarAccionesVacio?: boolean;
  /**
   * Avisa cuántos archivos hay cada vez que cambia la lista (al terminar de
   * cargar, al subir o al borrar). Lo usa la cabecera de la categoría
   * "Archivos" para que su número esté al día sin recargar la página.
   */
  onConteo?: (total: number) => void;
}>(function EntityFileBlocks({
  entidadTipo,
  entidadId,
  permitirSubida = true,
  vacioMensaje,
  titulo,
  defaultOpen = true,
  incluirDocumentosVinculados = true,
  ocultarEncabezado = false,
  permitirCarpetas = false,
  vistaLateral = false,
  ocultarAccionesVacio = false,
  onConteo,
}, ref) {
  const rol = useAcceso(entidadTipo);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [carpetasVacias, setCarpetasVacias] = useState<string[]>([]);
  const subirArchivosRef = useRef<SubirArchivosHandle>(null);
  const subidas = useSubidas();
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false);
  // Sin esto, el `[]` inicial (antes de que llegue la consulta) se reportaría
  // como "0 archivos" y la cabecera parpadearía.
  const [cargado, setCargado] = useState(false);
  const onConteoRef = useRef(onConteo);
  onConteoRef.current = onConteo;
  useEffect(() => {
    if (cargado) onConteoRef.current?.(archivos.length);
  }, [cargado, archivos.length]);
  const onAgregar = permitirSubida && (puedeEscribir(rol) && puedeEscribir(rol, "documentos"))
    ? () => subirArchivosRef.current?.abrirSelector()
    : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!entidadId) {
      setArchivos([]);
      setCarpetasVacias([]);
      return;
    }

    setArchivos([]);
    setCarpetasVacias([]);
    setCargado(false);
    const supabase = createClient();

    async function cargar() {
      const directosPromise = supabase
        .from("archivos")
        .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta, orden")
        .eq("entidad_tipo", entidadTipo)
        .eq("entidad_id", entidadId as string);

      // Minutas, testimonios, vigencias de poder, etc. son su propia ficha
      // en `documentos`, conectada por `vinculos` — no cuelgan directo de
      // esta entidad. El PDF real vive en `archivos` con
      // entidad_tipo='documento' apuntando a esa ficha, así que sin este
      // segundo salto esos adjuntos nunca aparecían. No aplica cuando la
      // propia entidad ya ES un documento (la consulta directa la cubre), ni
      // cuando el llamador pide explícitamente sólo los adjuntos directos.
      const vinculosPromise = entidadTipo === "documento" || !incluirDocumentosVinculados
        ? Promise.resolve({ data: [] as { origen_tipo: string; origen_id: string; destino_tipo: string; destino_id: string }[] })
        : supabase
            .from("vinculos")
            .select("origen_tipo, origen_id, destino_tipo, destino_id")
            .or(
              `and(origen_tipo.eq.${entidadTipo},origen_id.eq.${entidadId},destino_tipo.eq.documento),` +
              `and(destino_tipo.eq.${entidadTipo},destino_id.eq.${entidadId},origen_tipo.eq.documento)`
            );

      const carpetasPromise = permitirCarpetas
        ? supabase
            .from("carpetas_vacias")
            .select("valor")
            .eq("entidad_tipo", entidadTipo)
            .eq("entidad_id", entidadId as string)
            .eq("contexto", "archivo")
        : Promise.resolve({ data: [] as { valor: string }[] });

      const [{ data: directos }, { data: vinculos }, { data: marcadores }] = await Promise.all([
        directosPromise,
        vinculosPromise,
        carpetasPromise,
      ]);
      if (cancelled) return;

      const documentoIds = Array.from(new Set(
        (vinculos ?? []).map((v) => (v.origen_tipo === "documento" ? v.origen_id : v.destino_id))
      ));

      // En lotes: una ficha con cientos de documentos no entra en un solo `.in()`.
      const { data: deDocumentos } = documentoIds.length
        ? await fetchAllRowsIn(documentoIds, (lote, desde, hasta) => supabase
            .from("archivos")
            .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta, orden")
            .eq("entidad_tipo", "documento")
            .in("entidad_id", lote)
            .order("id")
            .range(desde, hasta))
        : { data: [] as Archivo[] };
      if (cancelled) return;

      const vistos = new Set<string>();
      const combinados: Archivo[] = [];
      for (const archivo of [...(directos ?? []), ...(deDocumentos ?? [])] as Archivo[]) {
        if (vistos.has(archivo.id)) continue;
        vistos.add(archivo.id);
        combinados.push(archivo);
      }
      setArchivos(combinados);
      setCarpetasVacias(Array.from(new Set((marcadores ?? []).map((fila) => fila.valor))).sort());
      setCargado(true);
    }

    cargar();

    return () => {
      cancelled = true;
    };
  }, [entidadId, entidadTipo, incluirDocumentosVinculados, permitirCarpetas]);

  function agregarLocal(archivo: Archivo) {
    setArchivos((current) => (current.some((existente) => existente.id === archivo.id) ? current : [...current, archivo]));
  }

  function quitarLocal(id: string) {
    setArchivos((current) => current.filter((archivo) => archivo.id !== id));
  }

  function moverLocal(id: string, carpeta: string | null) {
    setArchivos((current) => current.map((archivo) => (archivo.id === id ? { ...archivo, carpeta, orden: null } : archivo)));
  }

  function reordenarLocal(posiciones: Record<string, number | null>) {
    setArchivos((current) => current.map((archivo) => (archivo.id in posiciones ? { ...archivo, orden: posiciones[archivo.id] } : archivo)));
  }

  function agregarCarpetaLocal(ruta: string) {
    setCarpetasVacias((current) => current.includes(ruta) ? current : [...current, ruta].sort());
  }

  /** Espejo local de `reubicarCarpeta`: la carpeta y todo lo que cuelga de ella estrenan ruta. */
  function reubicarCarpetaLocal(origen: string, destino: string) {
    const dentro = (ruta?: string | null) => ruta === origen || Boolean(ruta?.startsWith(`${origen}/`));
    const reescribir = (ruta: string) => `${destino}${ruta.slice(origen.length)}`;
    setArchivos((current) =>
      current.map((archivo) => (dentro(archivo.carpeta) ? { ...archivo, carpeta: reescribir(archivo.carpeta as string) } : archivo))
    );
    setCarpetasVacias((current) =>
      Array.from(new Set([destino, ...current.map((ruta) => (dentro(ruta) ? reescribir(ruta) : ruta))])).sort()
    );
  }

  function quitarCarpetaLocal(ruta: string) {
    setCarpetasVacias((current) => current.filter((actual) => actual !== ruta && !actual.startsWith(`${ruta}/`)));
  }

  useImperativeHandle(ref, () => ({ agregar: agregarLocal, agregarCarpeta: agregarCarpetaLocal }), []);

  if (!entidadId) return null;

  /**
   * Deja soltar un archivo del sistema operativo sobre toda la tarjeta de
   * "Archivos", sin tener que abrir antes el menú "+" → "Documento". Sólo
   * reacciona a arrastres que traen `Files` (los del Finder/Explorador): el
   * arrastre interno para mover un adjunto entre carpetas usa su propia
   * marca (`TIPO_ARRASTRE`) y, cuando está activo, `useZonaSoltar` ya
   * intercepta esos eventos antes con `stopPropagation`, así que no chocan.
   */
  const puedeSubirDirecto = permitirSubida && (puedeEscribir(rol) && puedeEscribir(rol, "documentos"));
  const dropzoneTarjeta = puedeSubirDirecto ? {
    onDragOver(event: React.DragEvent) {
      if (!esArchivosDelSistema(event)) return;
      event.preventDefault();
      setArrastrandoArchivo(true);
    },
    onDragLeave(event: React.DragEvent) {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setArrastrandoArchivo(false);
    },
    onDrop(event: React.DragEvent) {
      if (!esArchivosDelSistema(event)) return;
      event.preventDefault();
      setArrastrandoArchivo(false);
      subidas.subirArrastre(event.dataTransfer, { entidadTipo, entidadId, onSubido: agregarLocal });
    },
  } : undefined;

  const rutasCarpeta = permitirCarpetas
    ? Array.from(new Set([
        ...archivos.map((a) => a.carpeta?.trim()).filter((c): c is string => Boolean(c)),
        ...carpetasVacias,
      ])).sort()
    : undefined;
  const carpetasSugeridas = rutasCarpeta
    ? Array.from(new Set(rutasCarpeta.map((ruta) => ruta.split("/")[0]).filter(Boolean))).sort()
    : undefined;
  const gestionCarpetas = permitirSubida && permitirCarpetas
    ? {
        entidadTipo,
        entidadId,
        onSubido: agregarLocal,
        onCarpetaCreada: agregarCarpetaLocal,
        onCarpetaEliminada: quitarCarpetaLocal,
        onMovido: moverLocal,
        onCarpetaReubicada: reubicarCarpetaLocal,
        onReordenado: reordenarLocal,
      }
    : undefined;

  if (!archivos.length && carpetasVacias.length === 0) {
    if (!permitirSubida) return null;
    const vacio = ocultarAccionesVacio ? (
      <div
        {...dropzoneTarjeta}
        className={cn(
          "rounded-lg px-3 py-4 text-center transition-colors",
          arrastrandoArchivo && "bg-brand-500/[0.06] outline outline-2 outline-brand-400/60"
        )}
      >
        <p className="text-[11px] text-white/35">{vacioMensaje ?? "No hay archivos adjuntos"}</p>
        {puedeSubirDirecto && (
          <p className="mt-1 text-[10px] text-white/30">o arrastra archivos aquí desde tu PC</p>
        )}
      </div>
    ) : (
      <div className="space-y-3 p-3">
        <div
          {...dropzoneTarjeta}
          className={cn(
            "glass-empty rounded-xl border-white/[0.08] py-8 transition-colors",
            arrastrandoArchivo && "border-brand-400/60 bg-brand-500/[0.06]"
          )}
        >
          <Paperclip className="h-6 w-6 text-white/30" />
          <p className="mt-2 text-[12px] text-white/60">{vacioMensaje ?? "No hay archivos adjuntos"}</p>
          {puedeSubirDirecto && <p className="mt-1 text-[10px] text-white/35">Arrastra archivos aquí para subirlos</p>}
        </div>
        {permitirCarpetas ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Agregar archivo o carpeta"
                aria-label="Agregar archivo o carpeta"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/85 data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="start"
              className="z-[101] w-60 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              <SubirConCarpeta
                subirArchivosRef={subirArchivosRef}
                entidadTipo={entidadTipo}
                entidadId={entidadId}
                onSubido={agregarLocal}
                onCarpetaCreada={agregarCarpetaLocal}
                carpetasSugeridas={carpetasSugeridas}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SubirArchivos
            ref={subirArchivosRef}
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            onSubido={agregarLocal}
            etiqueta="+ Agregar archivo"
          />
        )}
      </div>
    );
    if (ocultarEncabezado) return vacio;
    return <SeccionAdjuntos titulo={titulo} count={0} defaultOpen={defaultOpen} onAgregar={onAgregar}>{vacio}</SeccionAdjuntos>;
  }

  if (ocultarEncabezado) {
    return (
      <div
        {...dropzoneTarjeta}
        className={cn(
          "space-y-3 rounded-xl transition-colors",
          arrastrandoArchivo && "outline outline-2 outline-offset-2 outline-brand-400/60"
        )}
      >
        <ArchivosAdjuntos
          archivos={archivos}
          carpetasVacias={carpetasVacias}
          onEliminado={permitirSubida ? quitarLocal : undefined}
          subida={gestionCarpetas}
          vistaLateral={vistaLateral}
        />
        {permitirSubida && (
          <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Agregar archivo"
                aria-label="Agregar archivo"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/85 data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="start"
              className="z-[101] w-60 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              {permitirCarpetas ? (
                <SubirConCarpeta
                  entidadTipo={entidadTipo}
                  entidadId={entidadId}
                  onSubido={agregarLocal}
                  onCarpetaCreada={agregarCarpetaLocal}
                  carpetasSugeridas={carpetasSugeridas}
                />
              ) : (
                <SubirArchivos entidadTipo={entidadTipo} entidadId={entidadId} onSubido={agregarLocal} />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {puedeSubirDirecto && <AvisoArrastrar activo={arrastrandoArchivo} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <SeccionAdjuntos
      titulo={titulo}
      count={archivos.length}
      defaultOpen={defaultOpen}
      onAgregar={permitirCarpetas ? undefined : onAgregar}
      menuAgregar={
        permitirCarpetas && permitirSubida ? (
          <SubirConCarpeta
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            onSubido={agregarLocal}
            onCarpetaCreada={agregarCarpetaLocal}
            carpetasSugeridas={carpetasSugeridas}
          />
        ) : undefined
      }
    >
      {permitirCarpetas ? (
        <div
          {...dropzoneTarjeta}
          className={cn(
            "space-y-3 border-t border-white/[0.06] p-3 transition-colors",
            arrastrandoArchivo && "bg-brand-500/[0.06]"
          )}
        >
          <ArchivosAdjuntos
            archivos={archivos}
            carpetasVacias={carpetasVacias}
            onEliminado={permitirSubida ? quitarLocal : undefined}
            subida={gestionCarpetas}
            vistaLateral={vistaLateral}
          />
          {puedeSubirDirecto && <AvisoArrastrar activo={arrastrandoArchivo} />}
        </div>
      ) : (
        <AdjuntosTabla
          archivos={archivos}
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          permitirSubida={permitirSubida}
          onSubido={agregarLocal}
          onEliminado={permitirSubida ? quitarLocal : undefined}
          subirArchivosRef={subirArchivosRef}
        />
      )}
    </SeccionAdjuntos>
  );
});

/** Recordatorio de que la tarjeta acepta archivos soltados desde la PC. */
function AvisoArrastrar({ activo }: { activo: boolean }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-[10px] transition-colors", activo ? "text-brand-300" : "text-white/35")}>
      <UploadCloud className="h-3.5 w-3.5" />
      {activo ? "Suelta para subir (sobre una carpeta, se guarda dentro de ella)" : "o arrastra archivos aquí desde tu PC"}
    </p>
  );
}

// ─── Árbol de carpetas anidadas (estilo Notion) ────────────────────────────

type NodoCarpeta = {
  nombre: string;
  ruta: string;
  subcarpetas: Map<string, NodoCarpeta>;
  archivos: Archivo[];
};

type GestionCarpetas = {
  entidadTipo: string;
  entidadId: string;
  onSubido: (archivo: Archivo) => void;
  onCarpetaCreada: (ruta: string) => void;
  onCarpetaEliminada: (ruta: string) => void;
  /** Reubica un archivo ya cargado en otra carpeta (`null` = raíz) tras arrastrarlo. */
  onMovido: (id: string, carpeta: string | null) => void;
  /** Reescribe el árbol local cuando una carpeta cambia de ruta (moverla o renombrarla). */
  onCarpetaReubicada: (origen: string, destino: string) => void;
  /** Aplica posiciones manuales (`id` → `orden`) tras reordenar, o las restaura si el servidor falla. */
  onReordenado: (posiciones: Record<string, number | null>) => void;
};

// ─── Arrastrar archivos entre carpetas ─────────────────────────────────────

/**
 * Tipo propio en el `dataTransfer` para distinguir el arrastre de una fila de
 * archivo de cualquier otro (una imagen de la vista previa, un archivo del
 * escritorio, texto seleccionado…): sólo soltamos lo que lleva esta marca.
 */
const TIPO_ARRASTRE = "application/x-cavala-archivo";

/**
 * Lo que se lleva en la mano: una fila de archivo o una carpeta entera (con
 * todo lo que cuelga de ella). `origen` es siempre la carpeta que lo contiene
 * hoy — `null` cuando está suelto en la raíz.
 */
type Arrastre =
  | { tipo: "archivo"; id: string; nombre: string; origen: string | null }
  | { tipo: "carpeta"; ruta: string; nombre: string; origen: string | null };

type MovimientoArchivos = {
  arrastre: Arrastre | null;
  /**
   * Lo mismo que `arrastre`, pero al día desde el mismo `dragstart`: los
   * `dragover` que llegan antes del siguiente render lo leen de aquí.
   */
  arrastreActual: { current: Arrastre | null };
  iniciar: (arrastre: Arrastre) => void;
  terminar: () => void;
  /** Zona resaltada bajo el puntero: ruta de carpeta, `null` para la raíz, `undefined` si ninguna. */
  destino: string | null | undefined;
  marcarDestino: (ruta: string | null | undefined) => void;
  /** Todas las rutas del árbol, en el mismo orden en que se ven — para el menú "Mover a…". */
  rutas: string[];
  /** Suelta lo que se está arrastrando en `destino` (`null` = raíz). */
  soltarEn: (destino: string | null) => void;
  /** Devuelven el mensaje de error, o `null` si salió bien. */
  moverArchivo: (id: string, origen: string | null, destino: string | null) => Promise<string | null>;
  moverCarpeta: (ruta: string, destino: string | null) => Promise<string | null>;
  renombrarCarpeta: (ruta: string, nombre: string) => Promise<string | null>;
  /** Guarda `ids` (todos de `carpeta`) en ese orden. */
  reordenar: (carpeta: string | null, ids: string[]) => Promise<string | null>;
};

const MovimientoContext = createContext<MovimientoArchivos | null>(null);

/** `null` = la carpeta está en la raíz. */
function carpetaPadre(ruta: string): string | null {
  const corte = ruta.lastIndexOf("/");
  return corte === -1 ? null : ruta.slice(0, corte);
}

function esDescendiente(ruta: string | null, ancestro: string): boolean {
  return ruta === ancestro || Boolean(ruta?.startsWith(`${ancestro}/`));
}

/** Rutas del árbol en el mismo orden en que se pintan (cada carpeta seguida de sus hijas). */
function recopilarRutas(carpetas: NodoCarpeta[]): string[] {
  return [...carpetas].sort(compararCarpetas).flatMap((nodo) => [
    nodo.ruta,
    ...recopilarRutas(Array.from(nodo.subcarpetas.values())),
  ]);
}

/** Qué puede recibir una carpeta: no lo que ya vive en ella, ni una carpeta dentro de sí misma o de su descendencia. */
function admiteDestino(arrastre: Arrastre | null, ruta: string | null): boolean {
  if (!arrastre || arrastre.origen === ruta) return false;
  if (arrastre.tipo === "carpeta" && ruta !== null && esDescendiente(ruta, arrastre.ruta)) return false;
  return true;
}

/**
 * Convierte cualquier contenedor en destino de soltado para `ruta` (`null` =
 * raíz). `stopPropagation` en `dragover`/`drop` deja que gane la carpeta más
 * interna bajo el puntero: sin eso el evento burbujearía hasta la carpeta
 * padre y el archivo caería un nivel más arriba del que se ve resaltado.
 */
function useZonaSoltar(ruta: string | null) {
  const movimiento = useContext(MovimientoContext);
  const arrastre = movimiento?.arrastre ?? null;
  // Aunque no acepte lo que viene (ya vive aquí, o es su propia carpeta), la
  // zona sigue atajando el evento: si lo dejara burbujear, la carpeta de
  // arriba se quedaría con lo que se soltó sobre su hija.
  const admite = admiteDestino(arrastre, ruta);

  if (!movimiento || !arrastre) return { activa: false, props: {} };

  return {
    activa: admite && movimiento.destino === ruta,
    props: {
      onDragOver(event: React.DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = admite ? "move" : "none";
        movimiento.marcarDestino(admite ? ruta : undefined);
      },
      onDragLeave(event: React.DragEvent) {
        // `dragleave` también salta al pasar a un hijo; sólo apagamos el
        // resaltado cuando el puntero sale de verdad de la zona.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        movimiento.marcarDestino(undefined);
      },
      onDrop(event: React.DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (!admite) return movimiento.terminar();
        movimiento.soltarEn(ruta);
      },
    },
  };
}

/** Arrastre que viene del Finder/Explorador (no una fila de la app). */
function esArchivosDelSistema(event: React.DragEvent | DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * `true` mientras el usuario lleva archivos del sistema sobre la ventana.
 * Sirve para apagar los visores embebidos: un `<iframe>` de PDF se queda con
 * el `drop` y el navegador abre el archivo en vez de subirlo.
 */
function useArrastreSistema(): boolean {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    let profundidad = 0;
    function entrar(event: DragEvent) {
      if (!esArchivosDelSistema(event)) return;
      profundidad += 1;
      setActivo(true);
    }
    function salir(event: DragEvent) {
      if (!esArchivosDelSistema(event)) return;
      profundidad = Math.max(0, profundidad - 1);
      if (profundidad === 0) setActivo(false);
    }
    function terminar() {
      profundidad = 0;
      setActivo(false);
    }
    window.addEventListener("dragenter", entrar);
    window.addEventListener("dragleave", salir);
    window.addEventListener("drop", terminar);
    window.addEventListener("dragend", terminar);
    return () => {
      window.removeEventListener("dragenter", entrar);
      window.removeEventListener("dragleave", salir);
      window.removeEventListener("drop", terminar);
      window.removeEventListener("dragend", terminar);
    };
  }, []);
  return activo;
}

/** Props de arrastre para el asa de una fila de archivo o del encabezado de una carpeta. */
function useAsaArrastre(item: Arrastre | null) {
  const movimiento = useContext(MovimientoContext);
  if (!movimiento || !item) return undefined;
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      // La marca propia distingue esto de arrastrar una imagen de la vista
      // previa o un archivo del escritorio; el texto es lo que ve quien
      // suelte fuera de la app.
      event.dataTransfer.setData(TIPO_ARRASTRE, item.tipo === "archivo" ? item.id : item.ruta);
      event.dataTransfer.setData("text/plain", item.nombre);
      event.dataTransfer.effectAllowed = "move";
      movimiento.iniciar(item);
    },
    onDragEnd: () => movimiento.terminar(),
  };
}

/**
 * Menú "Mover a…": la raíz y todas las carpetas del árbol, sin las que no
 * pueden recibir esto. Es la alternativa al arrastre — con teclado, en
 * pantallas táctiles (donde arrastrar no existe) o cuando el destino queda
 * lejos del origen en una lista larga.
 */
function ListaDestinos({
  item,
  onElegido,
}: {
  item: Arrastre;
  onElegido?: () => void;
}) {
  const movimiento = useContext(MovimientoContext);
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null | undefined>(undefined);
  if (!movimiento) return null;

  const destinos = ([null, ...movimiento.rutas] as (string | null)[]).filter((ruta) => admiteDestino(item, ruta));

  async function elegir(destino: string | null) {
    setMoviendo(destino);
    setError(null);
    const fallo = item.tipo === "archivo"
      ? await movimiento!.moverArchivo(item.id, item.origen, destino)
      : await movimiento!.moverCarpeta(item.ruta, destino);
    setMoviendo(undefined);
    if (fallo) {
      setError(fallo);
      return;
    }
    onElegido?.();
  }

  return (
    <div className="space-y-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">Mover a</p>
      {destinos.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-white/45">No hay otra carpeta a donde moverlo.</p>
      ) : (
        <div className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-glass">
          {destinos.map((ruta) => {
            const segmentos = ruta ? ruta.split("/") : [];
            return (
              <button
                key={ruta ?? "__raiz__"}
                type="button"
                onClick={() => elegir(ruta)}
                disabled={moviendo !== undefined}
                title={ruta ?? "Raíz de Archivos"}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[11px] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ paddingLeft: `${6 + Math.max(segmentos.length - 1, 0) * 12}px` }}
              >
                {moviendo === ruta ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/60" />
                ) : ruta === null ? (
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-white/40" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-white/40" />
                )}
                <span className="min-w-0 truncate">{ruta === null ? "Raíz de Archivos" : segmentos[segmentos.length - 1]}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="px-1 text-[10.5px] text-red-300">{error}</p>}
    </div>
  );
}

function construirArbolCarpetas(archivos: Archivo[], carpetasVacias: string[] = []): { raiz: Archivo[]; carpetas: NodoCarpeta[] } {
  const raiz: Archivo[] = [];
  const carpetas: NodoCarpeta[] = [];
  const porRuta = new Map<string, NodoCarpeta>();

  function obtenerCarpeta(segmentos: string[]): NodoCarpeta {
    const ruta = segmentos.join("/");
    const existente = porRuta.get(ruta);
    if (existente) return existente;
    const nodo: NodoCarpeta = { nombre: segmentos[segmentos.length - 1], ruta, subcarpetas: new Map(), archivos: [] };
    porRuta.set(ruta, nodo);
    if (segmentos.length === 1) carpetas.push(nodo);
    else obtenerCarpeta(segmentos.slice(0, -1)).subcarpetas.set(nodo.nombre, nodo);
    return nodo;
  }

  for (const ruta of carpetasVacias) {
    const segmentos = ruta.split("/").map((s) => s.trim()).filter(Boolean);
    if (segmentos.length > 0) obtenerCarpeta(segmentos);
  }

  for (const archivo of archivos) {
    const segmentos = archivo.carpeta?.split("/").map((s) => s.trim()).filter(Boolean) ?? [];
    if (segmentos.length === 0) raiz.push(archivo);
    else obtenerCarpeta(segmentos).archivos.push(archivo);
  }

  for (const nodo of porRuta.values()) nodo.archivos = ordenarArchivos(nodo.archivos);
  return { raiz: ordenarArchivos(raiz), carpetas };
}

/**
 * Lo reordenado a mano primero, por su posición; lo demás después, por fecha
 * de subida y luego por nombre. Las consultas no traen `order by` (y mezclan
 * adjuntos directos con los de documentos vinculados), así que sin este
 * desempate el mismo panel salía en otro orden en cada carga. Un archivo
 * recién subido cae al final sin desordenar lo que ya se acomodó.
 */
function ordenarArchivos(archivos: Archivo[]): Archivo[] {
  return [...archivos].sort((a, b) =>
    (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER)
    || (a.subido_en ?? "").localeCompare(b.subido_en ?? "")
    || a.nombre_original.localeCompare(b.nombre_original, "es-PE", { numeric: true })
  );
}

function contarArchivosDe(nodo: NodoCarpeta): number {
  let total = nodo.archivos.length;
  for (const sub of nodo.subcarpetas.values()) total += contarArchivosDe(sub);
  return total;
}

/** Todos los archivos de una carpeta, incluidos los de sus subcarpetas — para poder borrarla de un solo golpe. */
function recopilarArchivosDe(nodo: NodoCarpeta): Archivo[] {
  let lista = [...nodo.archivos];
  for (const sub of nodo.subcarpetas.values()) lista = lista.concat(recopilarArchivosDe(sub));
  return lista;
}

const ORDEN_MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
  "AGOSTO", "SETIEMBRE", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/** Orden cronológico cuando el nombre ES un mes o un año; alfabético en cualquier otro caso. */
function compararCarpetas(a: NodoCarpeta, b: NodoCarpeta): number {
  const mesA = ORDEN_MESES.indexOf(a.nombre.trim().toLocaleUpperCase("es-PE"));
  const mesB = ORDEN_MESES.indexOf(b.nombre.trim().toLocaleUpperCase("es-PE"));
  if (mesA !== -1 && mesB !== -1) return mesA - mesB;
  if (/^\d{4}$/.test(a.nombre) && /^\d{4}$/.test(b.nombre)) return Number(a.nombre) - Number(b.nombre);
  return a.nombre.localeCompare(b.nombre, "es-PE");
}

/**
 * Carpetas hermanas en grilla en vez de apiladas una por fila. `auto-fit` +
 * `minmax` reparte columnas según el ancho REAL del contenedor (no el del
 * viewport): a varios niveles de anidamiento, cada `pl-4` angosta el espacio
 * disponible, así que un breakpoint de viewport (`sm:grid-cols-2`) seguía
 * forzando 2 columnas incluso cuando ya no cabía ni el nombre de la carpeta.
 */
function GrupoCarpetas({
  carpetas,
  onEliminado,
  subida,
  vistaLateral = false,
}: {
  carpetas: NodoCarpeta[];
  onEliminado?: (id: string) => void;
  subida?: GestionCarpetas;
  /** Panel angosto (sheet lateral): fuerza 2 carpetas por fila en vez de repartir por ancho disponible. */
  vistaLateral?: boolean;
}) {
  if (carpetas.length === 0) return null;
  return (
    <div
      className={cn(
        "grid items-start gap-2",
        vistaLateral ? "grid-cols-2" : "[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]"
      )}
    >
      {carpetas.map((nodo) => (
        <CarpetaDesplegable key={nodo.ruta} nodo={nodo} onEliminado={onEliminado} subida={subida} vistaLateral={vistaLateral} />
      ))}
    </div>
  );
}

/**
 * Carpeta plegable (chevron + nombre + contador), con subcarpetas y archivos
 * anidados dentro. Cuando `subida` viene informado, el botón "+" del
 * encabezado abre un menú desplegable (`SubirConCarpeta`) para subir
 * archivos directo dentro de esta carpeta o de una subcarpeta nueva (o
 * existente) sin tener que escribir la ruta completa desde el formulario de
 * nivel superior.
 */
function CarpetaDesplegable({
  nodo,
  onEliminado,
  subida,
  vistaLateral = false,
}: {
  nodo: NodoCarpeta;
  onEliminado?: (id: string) => void;
  subida?: GestionCarpetas;
  vistaLateral?: boolean;
}) {
  const rol = useAcceso(subida?.entidadTipo);
  const puedeSubir = Boolean(subida) && puedeEscribir(rol) && puedeEscribir(rol, "documentos");
  const puedeBorrar = Boolean(onEliminado) && puedeEscribir(rol) && puedeEscribir(rol, "documentos");
  const [abierto, setAbierto] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const subcarpetas = useMemo(() => Array.from(nodo.subcarpetas.values()).sort(compararCarpetas), [nodo]);
  const total = useMemo(() => contarArchivosDe(nodo), [nodo]);
  const subcarpetasSugeridas = useMemo(() => Array.from(nodo.subcarpetas.keys()).sort((a, b) => a.localeCompare(b, "es-PE")), [nodo]);
  const { activa: destinoMover, props: propsSoltar } = useZonaSoltar(nodo.ruta);
  const subidas = useSubidas();
  const [destinoSubida, setDestinoSubida] = useState(false);
  const destinoActivo = destinoMover || destinoSubida;
  // Archivos del Finder/Explorador soltados sobre la carpeta entran en ella
  // (no en la raíz de la tarjeta). `stopPropagation` evita que la tarjeta de
  // afuera los suba otra vez; lo que no es del sistema sigue al mover interno.
  const propsZona = {
    onDragOver(event: React.DragEvent) {
      if (!esArchivosDelSistema(event)) return propsSoltar.onDragOver?.(event);
      if (!puedeSubir) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setDestinoSubida(true);
    },
    onDragLeave(event: React.DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDestinoSubida(false);
      propsSoltar.onDragLeave?.(event);
    },
    onDrop(event: React.DragEvent) {
      if (!esArchivosDelSistema(event)) return propsSoltar.onDrop?.(event);
      if (!puedeSubir || !subida) return;
      event.preventDefault();
      event.stopPropagation();
      setDestinoSubida(false);
      setAbierto(true);
      subidas.subirArrastre(event.dataTransfer, { entidadTipo: subida.entidadTipo, entidadId: subida.entidadId, carpeta: nodo.ruta, onSubido: subida.onSubido });
    },
  };
  const movimiento = useContext(MovimientoContext);
  const item: Arrastre = { tipo: "carpeta", ruta: nodo.ruta, nombre: nodo.nombre, origen: carpetaPadre(nodo.ruta) };
  const propsAsa = useAsaArrastre(movimiento ? item : null);
  const arrastre = movimiento?.arrastre ?? null;
  const enVuelo = arrastre?.tipo === "carpeta" && arrastre.ruta === nodo.ruta;
  // Lo arrastrado sale de aquí abajo (de una subcarpeta, no de esta carpeta):
  // ofrecemos subirlo un nivel, hasta esta carpeta.
  const vieneDeDentro = Boolean(
    arrastre && arrastre.origen !== nodo.ruta && esDescendiente(arrastre.origen, nodo.ruta)
  );

  // Carpeta "de resorte": quedarse encima con algo en la mano la abre sola,
  // para poder seguir hasta una subcarpeta sin soltar lo que se arrastra.
  useEffect(() => {
    if (!destinoActivo || abierto) return;
    const temporizador = setTimeout(() => setAbierto(true), 700);
    return () => clearTimeout(temporizador);
  }, [destinoActivo, abierto]);

  return (
    // Abierta ocupa todo el ancho de la grilla: una carpeta puede traer
    // subcarpetas o archivos que una columna angosta compartida con sus
    // hermanas no alcanza a mostrar sin truncar todo (nombre, tamaño,
    // acciones). Cerrada sigue siendo compacta para que varias quepan lado a
    // lado, que es el caso común (una carpeta con un par de archivos).
    <div
      {...propsZona}
      title={destinoSubida ? `Soltar para subir a "${nodo.nombre}"` : undefined}
      className={cn(
        "overflow-hidden rounded-xl border bg-black/10 transition-[border-color,background-color,box-shadow,opacity]",
        destinoActivo ? "border-brand-400/60 bg-brand-400/[0.08] ring-1 ring-brand-400/40" : "border-white/[0.08]",
        enVuelo && "opacity-40",
        abierto && "col-span-full"
      )}
    >
      <div
        {...propsAsa}
        // Un ancestro `draggable` impide seleccionar texto dentro de un input
        // en Chrome, así que mientras se renombra la carpeta deja de ser
        // arrastrable.
        draggable={Boolean(propsAsa) && !renombrando}
        className={cn(
          "group/carpeta flex w-full items-center gap-1 px-3 py-2.5",
          propsAsa && !renombrando && "cursor-grab active:cursor-grabbing"
        )}
      >
        {propsAsa && (
          <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/20 transition-colors group-hover/carpeta:text-white/55" />
        )}
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label={abierto ? `Contraer ${nodo.nombre}` : `Expandir ${nodo.nombre}`}
          className="flex shrink-0 items-center gap-2 rounded-md py-0.5 pr-1 text-left transition-colors hover:bg-white/[0.06]"
        >
          <TrianguloDesplegable abierto={abierto} className="text-white/40" />
          <Folder className="h-4 w-4 shrink-0 text-white/45" />
        </button>
        <NombreCarpeta
          nodo={nodo}
          renombrando={renombrando}
          onRenombrando={setRenombrando}
          onAbrir={() => setAbierto(true)}
        />
        <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{total}</span>
        {movimiento && <MenuMover item={item} compacto />}
        {puedeSubir && subida && (
          <DropdownMenu modal={false} onOpenChange={(open) => open && setAbierto(true)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Subir archivos o crear subcarpeta"
                aria-label={`Subir archivos o crear subcarpeta dentro de ${nodo.nombre}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="end"
              className="z-[101] w-60 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              <SubirConCarpeta
                entidadTipo={subida.entidadTipo}
                entidadId={subida.entidadId}
                onSubido={subida.onSubido}
                onCarpetaCreada={subida.onCarpetaCreada}
                carpetaBase={nodo.ruta}
                carpetasSugeridas={subcarpetasSugeridas}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {puedeBorrar && onEliminado && subida && (
          <EliminarCarpetaButton nodo={nodo} onEliminado={onEliminado} gestion={subida} />
        )}
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 border-t border-white/[0.06] p-2 pl-4">
            <GrupoCarpetas carpetas={subcarpetas} onEliminado={onEliminado} subida={subida} vistaLateral={vistaLateral} />
            {nodo.archivos.length > 0 && (
              <ListaArchivos archivos={nodo.archivos} carpeta={nodo.ruta} onEliminado={onEliminado} />
            )}
            {vieneDeDentro && (
              <FranjaSoltar activa={destinoActivo}>Soltar aquí para subirlo a &quot;{nodo.nombre}&quot;</FranjaSoltar>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Nombre de la carpeta con el mismo gesto que una celda de las tablas
 * (`InlineEditableText`): se ve como texto y un clic lo convierte en campo.
 * Enter o salir del campo guarda, Escape descarta. Sin permiso de escritura es
 * texto y nada más.
 */
function NombreCarpeta({
  nodo,
  renombrando,
  onRenombrando,
  onAbrir,
}: {
  nodo: NodoCarpeta;
  renombrando: boolean;
  onRenombrando: (valor: boolean) => void;
  /** Renombrar una carpeta cerrada la abre, para ver sobre qué se acaba de escribir. */
  onAbrir: () => void;
}) {
  const movimiento = useContext(MovimientoContext);
  const [valor, setValor] = useState(nodo.nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // `guardar` corre tanto en el submit como en el blur que ese mismo submit
  // provoca; sin esto la segunda llamada pediría el cambio por duplicado.
  const cerrado = useRef(false);

  useEffect(() => {
    if (!renombrando || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [renombrando]);

  if (!movimiento) {
    return <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/85">{nodo.nombre}</span>;
  }

  function cancelar() {
    cerrado.current = true;
    setValor(nodo.nombre);
    setError(null);
    onRenombrando(false);
  }

  /**
   * `confirmado` distingue Enter de salir del campo: con un nombre inválido,
   * Enter deja seguir corrigiendo (perder lo escrito sería peor), mientras que
   * irse a otro lado simplemente descarta.
   */
  async function guardar(confirmado: boolean) {
    if (cerrado.current) return;
    const limpio = valor.trim();
    if (!limpio || limpio === nodo.nombre) return cancelar();
    if (limpio.includes("/") || /[\u0000-\u001f\u007f]/.test(limpio)) {
      if (!confirmado) return cancelar();
      setError("Usa un solo nombre, sin barras ni caracteres de control");
      inputRef.current?.focus();
      return;
    }
    cerrado.current = true;
    setGuardando(true);
    // El error del servidor (nombre repetido, demasiados niveles) ya sale en
    // el aviso de arriba del panel; aquí sólo se vuelve al nombre anterior.
    const fallo = await movimiento!.renombrarCarpeta(nodo.ruta, limpio);
    setGuardando(false);
    setValor(fallo ? nodo.nombre : limpio);
    setError(null);
    onRenombrando(false);
    if (!fallo) onAbrir();
  }

  if (renombrando) {
    return (
      <input
        ref={inputRef}
        value={valor}
        maxLength={60}
        aria-label="Nombre de la carpeta"
        aria-invalid={Boolean(error)}
        title={error ?? undefined}
        onChange={(evento) => {
          setValor(evento.target.value);
          setError(null);
        }}
        onBlur={() => void guardar(false)}
        onKeyDown={(evento) => {
          evento.stopPropagation();
          if (evento.key === "Enter") {
            evento.preventDefault();
            void guardar(true);
          }
          if (evento.key === "Escape") {
            evento.preventDefault();
            cancelar();
          }
        }}
        className={cn(
          "min-w-0 flex-1 rounded-md border bg-black/40 px-1.5 py-0.5 text-[12.5px] font-semibold text-white outline-none ring-1",
          error ? "border-red-400/60 ring-red-400/30" : "border-brand-400/50 ring-brand-400/25"
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setError(null);
        cerrado.current = false;
        setValor(nodo.nombre);
        onRenombrando(true);
      }}
      title={`${nodo.nombre} — clic para renombrar`}
      className={cn(
        "min-w-0 flex-1 cursor-text truncate rounded-md px-1.5 py-0.5 text-left text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/[0.06]",
        guardando && "opacity-60"
      )}
    >
      {nodo.nombre}
    </button>
  );
}

/**
 * Botón "Eliminar carpeta" del encabezado de `CarpetaDesplegable`: manda a la
 * papelera (reversible, mismo endpoint que un archivo suelto) todos los
 * archivos de la carpeta, incluidos los de sus subcarpetas. Confirmación en
 * línea con el conteo real, mismo patrón que `DeleteCategoryButton`.
 */
function EliminarCarpetaButton({
  nodo,
  onEliminado,
  gestion,
}: {
  nodo: NodoCarpeta;
  onEliminado: (id: string) => void;
  gestion: GestionCarpetas;
}) {
  const [estado, setEstado] = useState<"idle" | "confirmando" | "eliminando">("idle");
  const [error, setError] = useState<string | null>(null);
  const archivos = useMemo(() => recopilarArchivosDe(nodo), [nodo]);

  // Intenta borrar TODOS los archivos en paralelo (no uno a uno abortando en
  // el primer fallo): así un archivo con problemas no deja a mitad de camino
  // a los demás. Si algunos fallan, se queda en "confirmando" con el conteo
  // de fallos para poder reintentar — `archivos` ya sólo trae los que
  // quedaron (los borrados con éxito desaparecieron del árbol al re-renderizar).
  async function confirmar() {
    setEstado("eliminando");
    setError(null);
    const resultados = await Promise.allSettled(
      archivos.map(async (archivo) => {
        const response = await fetch(`/api/archivos/${archivo.id}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}) as { error?: string });
        if (!response.ok) throw new Error(data.error || `No se pudo eliminar "${archivo.nombre_original}"`);
        onEliminado(archivo.id);
      })
    );
    const fallidos = resultados.filter((r) => r.status === "rejected").length;
    if (fallidos > 0) {
      setError(fallidos === archivos.length ? "No se pudo eliminar ningún archivo" : `${fallidos} de ${archivos.length} no se pudieron eliminar`);
      setEstado("confirmando");
      return;
    }

    const resultado = await eliminarCarpetaVacia(gestion.entidadTipo, gestion.entidadId, "archivo", nodo.ruta);
    if (!resultado.ok) {
      setError(resultado.error);
      setEstado("confirmando");
      return;
    }
    gestion.onCarpetaEliminada(nodo.ruta);
  }

  if (estado !== "idle") {
    return (
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/10 pl-2" role="group" aria-label={`Confirmar eliminación de la carpeta ${nodo.nombre}`}>
        <span className="max-w-[170px] truncate text-[10px] font-medium text-red-200" title={error ?? undefined}>
          {error ?? `¿Eliminar la carpeta "${nodo.nombre}" (${archivos.length} archivo${archivos.length === 1 ? "" : "s"})?`}
        </span>
        <button
          type="button"
          onClick={confirmar}
          disabled={estado === "eliminando"}
          title={error ? "Reintentar con los que faltan" : "Confirmar eliminación"}
          aria-label={error ? `Reintentar eliminación de la carpeta ${nodo.nombre}` : `Confirmar eliminación de la carpeta ${nodo.nombre}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {estado === "eliminando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sí"}
        </button>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          title="Cancelar"
          aria-label="Cancelar eliminación"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEstado("confirmando")}
      title={`Eliminar carpeta ${nodo.nombre}`}
      aria-label={`Eliminar carpeta ${nodo.nombre}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Adjuntos de una entidad, agrupados en carpetas anidadas cuando alguno trae
 * `carpeta` (restaurado de Notion, o elegido al subir) — mismo aspecto que
 * `SeccionAdjuntos`/`CategoriaDesplegable`. Sin carpetas, es la lista plana
 * de siempre (`ListaArchivos`), sin ningún cambio visual.
 */
export function ArchivosAdjuntos({
  archivos,
  carpetasVacias = [],
  onEliminado,
  subida,
  vistaLateral = false,
}: {
  archivos: Archivo[];
  /** Marcadores persistidos de carpetas sin contenido (incluye rutas anidadas). */
  carpetasVacias?: string[];
  onEliminado?: (id: string) => void;
  /** Cuando viene informado, cada carpeta muestra un "+" para subir archivos directo dentro de una subcarpeta suya. */
  subida?: GestionCarpetas;
  /** Panel angosto (sheet lateral): fuerza 2 carpetas por fila en vez de repartir por ancho disponible. */
  vistaLateral?: boolean;
}) {
  const rol = useAcceso(subida?.entidadTipo);
  const puedeMover = Boolean(subida) && puedeEscribir(rol) && puedeEscribir(rol, "documentos");
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const arrastreActual = useRef<Arrastre | null>(null);
  const [destino, setDestino] = useState<string | null | undefined>(undefined);
  const [errorMover, setErrorMover] = useState<string | null>(null);

  const { raiz, carpetas } = useMemo(
    () => construirArbolCarpetas(archivos, carpetasVacias),
    [archivos, carpetasVacias]
  );
  const rutas = useMemo(() => recopilarRutas(carpetas), [carpetas]);

  const movimiento = useMemo<MovimientoArchivos | null>(() => {
    if (!puedeMover || !subida) return null;

    // Optimista: la fila salta de carpeta al instante y sólo vuelve a su
    // sitio si el servidor rechaza el movimiento.
    async function moverArchivo(id: string, origen: string | null, rutaDestino: string | null) {
      if (origen === rutaDestino) return null;
      setErrorMover(null);
      subida!.onMovido(id, rutaDestino);
      const resultado = await moverArchivoACarpeta(id, rutaDestino);
      if (!resultado.ok) {
        subida!.onMovido(id, origen);
        setErrorMover(resultado.error);
        return resultado.error;
      }
      // La carpeta de la que salió pudo quedarse vacía; el marcador que
      // acaba de dejar el servidor la mantiene visible también aquí.
      if (origen) subida!.onCarpetaCreada(origen);
      return null;
    }

    // Optimista como mover: las filas quedan en su sitio nuevo al instante y
    // vuelven a sus posiciones anteriores si el servidor no lo guarda.
    async function reordenar(carpeta: string | null, ids: string[]) {
      setErrorMover(null);
      const anteriores: Record<string, number | null> = {};
      const nuevas: Record<string, number | null> = {};
      ids.forEach((id, posicion) => {
        anteriores[id] = archivos.find((archivo) => archivo.id === id)?.orden ?? null;
        nuevas[id] = posicion;
      });
      subida!.onReordenado(nuevas);
      const resultado = await reordenarArchivos(ids, carpeta);
      if (!resultado.ok) {
        subida!.onReordenado(anteriores);
        setErrorMover(resultado.error);
        return resultado.error;
      }
      return null;
    }

    /** Mover y renombrar son lo mismo: cambiarle la ruta a la carpeta. */
    async function reubicar(ruta: string, nuevaRuta: string) {
      if (ruta === nuevaRuta) return null;
      setErrorMover(null);
      // Le pasamos los archivos que el panel ve dentro: los que cuelgan de un
      // documento vinculado no salen en la consulta por ficha del servidor y
      // se quedarían en la ruta vieja.
      const contenido = archivos.filter((archivo) => esDescendiente(archivo.carpeta ?? null, ruta)).map((archivo) => archivo.id);
      // Sin optimismo, a diferencia de un archivo suelto: esto reescribe la
      // ruta de todo lo que cuelga abajo y deshacerlo a ciegas si el servidor
      // dice que no saldría más caro que esperar el visto bueno.
      const resultado = await reubicarCarpeta(subida!.entidadTipo, subida!.entidadId, ruta, nuevaRuta, contenido);
      if (!resultado.ok) {
        setErrorMover(resultado.error);
        return resultado.error;
      }
      subida!.onCarpetaReubicada(ruta, nuevaRuta);
      return null;
    }

    return {
      arrastre,
      arrastreActual,
      destino,
      rutas,
      iniciar: (nuevo) => {
        setErrorMover(null);
        arrastreActual.current = nuevo;
        setArrastre(nuevo);
      },
      terminar: () => {
        arrastreActual.current = null;
        setArrastre(null);
        setDestino(undefined);
      },
      marcarDestino: setDestino,
      moverArchivo,
      reordenar,
      moverCarpeta: (ruta, rutaDestino) =>
        reubicar(ruta, rutaDestino ? `${rutaDestino}/${ruta.split("/").pop()}` : (ruta.split("/").pop() as string)),
      renombrarCarpeta: (ruta, nombre) => {
        const padre = carpetaPadre(ruta);
        return reubicar(ruta, padre ? `${padre}/${nombre}` : nombre);
      },
      soltarEn: (rutaDestino) => {
        const enVuelo = arrastre;
        arrastreActual.current = null;
        setArrastre(null);
        setDestino(undefined);
        if (!admiteDestino(enVuelo, rutaDestino) || !enVuelo) return;
        if (enVuelo.tipo === "archivo") void moverArchivo(enVuelo.id, enVuelo.origen, rutaDestino);
        else void reubicar(enVuelo.ruta, rutaDestino ? `${rutaDestino}/${enVuelo.nombre}` : enVuelo.nombre);
      },
    };
  }, [puedeMover, subida, arrastre, destino, rutas, archivos]);

  // Sin carpetas no hay a dónde mover, pero sí se puede reordenar la raíz.
  if (carpetas.length === 0) {
    return (
      <MovimientoContext.Provider value={movimiento}>
        {errorMover && <p role="alert" className="text-[11px] text-red-300">{errorMover}</p>}
        <ListaArchivos archivos={raiz} carpeta={null} onEliminado={onEliminado} />
      </MovimientoContext.Provider>
    );
  }

  return (
    <MovimientoContext.Provider value={movimiento}>
      <ZonaRaiz>
        {errorMover && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
            <p className="min-w-0 flex-1">{errorMover}</p>
            <button
              type="button"
              onClick={() => setErrorMover(null)}
              title="Cerrar"
              aria-label="Cerrar el mensaje de error"
              className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-200/70 transition-colors hover:bg-red-500/20 hover:text-red-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <GrupoCarpetas carpetas={carpetas.sort(compararCarpetas)} onEliminado={onEliminado} subida={subida} vistaLateral={vistaLateral} />
        {raiz.length > 0 && <ListaArchivos archivos={raiz} carpeta={null} onEliminado={onEliminado} />}
      </ZonaRaiz>
    </MovimientoContext.Provider>
  );
}

/**
 * Contenedor de todo el árbol: soltar aquí (fuera de cualquier carpeta) saca
 * lo arrastrado a la raíz. Mientras hay algo en vuelo que viene de dentro de
 * una carpeta muestra una franja explícita, porque con la raíz vacía no
 * quedaría ninguna superficie evidente donde soltar.
 */
function ZonaRaiz({ children }: { children: React.ReactNode }) {
  const movimiento = useContext(MovimientoContext);
  const { activa, props } = useZonaSoltar(null);
  const arrastre = movimiento?.arrastre ?? null;

  return (
    <div {...props} className="space-y-2">
      {children}
      {arrastre && arrastre.origen !== null && (
        <FranjaSoltar activa={activa}>
          {arrastre.tipo === "carpeta"
            ? `Soltar aquí para sacar "${arrastre.nombre}" a la raíz`
            : "Soltar aquí para sacarlo de la carpeta"}
        </FranjaSoltar>
      )}
    </div>
  );
}

/** Franja punteada que aparece sólo durante un arrastre para señalar un destino que si no sería invisible. */
function FranjaSoltar({ activa, children }: { activa: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed px-3 py-2.5 text-center text-[11px] transition-colors",
        activa ? "border-brand-400/60 bg-brand-400/10 text-white/85" : "border-white/15 text-white/45"
      )}
    >
      {children}
    </div>
  );
}

function ListaArchivos({
  archivos,
  carpeta = null,
  onEliminado,
}: {
  archivos: Archivo[];
  /** Carpeta a la que pertenecen estas filas (`null` = raíz), para saber de dónde sale lo que se arrastra. */
  carpeta?: string | null;
  onEliminado?: (id: string) => void;
}) {
  const rol = useAcceso();
  const movimiento = useContext(MovimientoContext);
  const puedeBorrar = Boolean(onEliminado) && (puedeEscribir(rol) && puedeEscribir(rol, "documentos"));
  const rootRef = useRef<HTMLDivElement>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const first = archivos.find(canPreview);
    return new Set(first ? [first.id] : []);
  });
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  /** Dónde caería la fila que se arrastra: antes o después de `id`. */
  const [indicador, setIndicador] = useState<{ id: string; despues: boolean } | null>(null);
  // Copia síncrona para el `drop`: si llega pegado al último `dragover`, el
  // estado todavía no se re-renderizó y el soltado se perdía.
  const indicadorRef = useRef<{ id: string; despues: boolean } | null>(null);
  const arrastreSistema = useArrastreSistema();
  const arrastre = movimiento?.arrastre ?? null;
  // Sólo se reordena entre hermanas: una fila de otra carpeta que pasa por
  // encima sigue de largo hasta la zona de la carpeta, que la mueve.
  const esReordenable = (enMano: Arrastre | null) => enMano?.tipo === "archivo" && enMano.origen === carpeta && archivos.length > 1;
  const reordenando = esReordenable(arrastre);

  useEffect(() => {
    if (reordenando) return;
    indicadorRef.current = null;
    setIndicador(null);
  }, [reordenando]);

  // Siempre montados (no sólo con `reordenando`): el primer `dragover` llega
  // antes de que se re-renderice tras el `dragstart`.
  const propsReordenar = movimiento ? {
    onDragOver(event: React.DragEvent) {
      if (!esReordenable(movimiento.arrastreActual.current)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      movimiento.marcarDestino(undefined);
    },
    onDragLeave(event: React.DragEvent) {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      indicadorRef.current = null;
      setIndicador(null);
    },
    onDrop(event: React.DragEvent) {
      const enVuelo = movimiento.arrastreActual.current;
      if (!esReordenable(enVuelo)) return;
      event.preventDefault();
      event.stopPropagation();
      const objetivo = indicadorRef.current;
      movimiento.terminar();
      indicadorRef.current = null;
      setIndicador(null);
      if (!enVuelo || enVuelo.tipo !== "archivo" || !objetivo || objetivo.id === enVuelo.id) return;
      const ids = archivos.map((archivo) => archivo.id).filter((id) => id !== enVuelo.id);
      const indice = ids.indexOf(objetivo.id);
      if (indice === -1) return;
      ids.splice(objetivo.despues ? indice + 1 : indice, 0, enVuelo.id);
      if (ids.every((id, i) => id === archivos[i].id)) return;
      void movimiento.reordenar(carpeta, ids);
    },
  } : {};

  /** La mitad de la fila bajo el puntero decide si cae antes o después de ella. */
  function marcarPosicion(event: React.DragEvent, id: string) {
    if (!esReordenable(movimiento?.arrastreActual.current ?? null)) return;
    const caja = event.currentTarget.getBoundingClientRect();
    const despues = event.clientY > caja.top + caja.height / 2;
    indicadorRef.current = { id, despues };
    setIndicador((actual) => (actual?.id === id && actual.despues === despues ? actual : { id, despues }));
  }

  useEffect(() => {
    const first = archivos.find(canPreview);
    if (!first) return;
    setOpenIds((current) => {
      // Si el usuario cerró todas las vistas manualmente, no reabrirlas.
      if (current.size === 0) return current;
      const stillValid = Array.from(current).some((id) => archivos.some((archivo) => archivo.id === id));
      return stillValid ? current : new Set([first.id]);
    });
  }, [archivos]);

  useEffect(() => {
    if (!maximizedId) return;
    const host = rootRef.current?.closest<HTMLElement>("[data-entity-sheet-window]") ?? document.body;
    setPortalHost(host);

    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMaximizedId(null);
    }

    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [maximizedId]);

  const maximized = useMemo(
    () => archivos.find((archivo) => archivo.id === maximizedId) ?? null,
    [archivos, maximizedId]
  );

  function togglePreview(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function maximize(id: string) {
    setOpenIds((current) => new Set(current).add(id));
    setMaximizedId(id);
  }

  function eliminar(id: string) {
    if (maximizedId === id) setMaximizedId(null);
    onEliminado?.(id);
  }

  const maximizedWindow = maximized && portalHost && createPortal(
    <div
      className={cn(
        "embedded-file-window z-[80] flex flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0b0d16]/[0.98] shadow-[0_28px_90px_rgba(0,0,0,.72)] backdrop-blur-2xl",
        portalHost === document.body ? "fixed inset-2 sm:inset-6" : "absolute inset-2 sm:inset-3"
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista ampliada de ${maximized.nombre_original}`}
    >
      <FileWindowBar
        archivo={maximized}
        open
        maximized
        onToggle={() => setMaximizedId(null)}
        onMaximize={() => setMaximizedId(null)}
        onClose={() => setMaximizedId(null)}
        onDeleted={puedeBorrar ? () => eliminar(maximized.id) : undefined}
      />
      <div className="min-h-0 flex-1 bg-black/30 p-1.5 sm:p-3">
        <FileContent archivo={maximized} large />
      </div>
    </div>,
    portalHost
  );

  return (
    <div
      ref={rootRef}
      {...propsReordenar}
      className={cn(
        "space-y-3",
        // Un visor embebido se traga los eventos de arrastre (y un PDF soltado
        // encima lo abre el navegador): mientras se arrastra, no reciben puntero.
        (arrastreSistema || arrastre) && "[&_iframe]:pointer-events-none [&_video]:pointer-events-none"
      )}
    >
      {archivos.map((archivo) => {
        const open = openIds.has(archivo.id);
        const enVuelo = arrastre?.tipo === "archivo" && arrastre.id === archivo.id;
        const item: Arrastre = { tipo: "archivo", id: archivo.id, nombre: archivo.nombre_original, origen: carpeta };
        const linea = indicador?.id === archivo.id && !enVuelo ? (indicador.despues ? "despues" : "antes") : null;
        return (
          <div key={archivo.id} className="relative" onDragOver={(event) => marcarPosicion(event, archivo.id)}>
          {linea && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(96,165,250,.6)]",
                linea === "antes" ? "-top-[7px]" : "-bottom-[7px]"
              )}
            />
          )}
          <article
            className={cn(
              "overflow-hidden rounded-xl border bg-black/10 transition-[border-color,background-color,box-shadow,opacity] duration-200",
              open
                ? "border-white/[0.13] bg-black/20 shadow-[0_12px_30px_rgba(0,0,0,.16)]"
                : "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.025]",
              enVuelo && "opacity-40"
            )}
          >
            <FileWindowBar
              archivo={archivo}
              open={open}
              maximized={false}
              onToggle={() => togglePreview(archivo.id)}
              onMaximize={() => maximize(archivo.id)}
              onDeleted={puedeBorrar ? () => eliminar(archivo.id) : undefined}
              movible={movimiento ? item : undefined}
            />
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="h-[280px] border-t border-white/[0.08] bg-black/25 p-1.5 sm:h-[380px] sm:p-2.5">
                  <FileContent archivo={archivo} />
                </div>
              </div>
            </div>
          </article>
          </div>
        );
      })}
      {maximizedWindow}
    </div>
  );
}

function FileWindowBar({
  archivo,
  open,
  maximized,
  onToggle,
  onMaximize,
  onClose,
  onDeleted,
  movible,
}: {
  archivo: Archivo;
  open: boolean;
  maximized: boolean;
  onToggle: () => void;
  onMaximize: () => void;
  onClose?: () => void;
  onDeleted?: () => void;
  /**
   * Convierte la barra en el asa para llevar el archivo a otra carpeta (y
   * suma el menú "Mover a…"). El asa va en la barra y no en toda la tarjeta a
   * propósito: dentro de la vista previa hay imágenes que el navegador ya
   * arrastra por su cuenta.
   */
  movible?: Arrastre;
}) {
  const previewable = canPreview(archivo);
  const url = `/api/archivos/${archivo.id}`;
  const propsAsa = useAsaArrastre(movible ?? null);

  return (
    <header
      {...propsAsa}
      className={cn(
        "group/barra flex min-h-[54px] items-center gap-1.5 bg-white/[0.025] px-3",
        propsAsa && "cursor-grab active:cursor-grabbing"
      )}
    >
      {propsAsa && (
        <GripVertical
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-white/20 transition-colors group-hover/barra:text-white/55"
        />
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Ocultar vista previa" : "Mostrar vista previa"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <TrianguloDesplegable abierto={open} />
      </button>
      <button type="button" onClick={onToggle} className="group/nombre min-w-0 flex-1 text-left">
        <span className="block truncate text-[12px] font-medium text-white/90 transition-colors group-hover/nombre:text-white group-hover/nombre:underline">{archivo.nombre_original}</span>
        <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.08em] text-white/65">
          {extensionOf(archivo.nombre_original)}{archivo.tamano_bytes ? ` · ${formatBytes(archivo.tamano_bytes)}` : ""}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        {previewable && (
          <WindowAction label={maximized ? "Restaurar dentro del panel" : "Ampliar dentro del panel"} onClick={onMaximize}>
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </WindowAction>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Descargar archivo"
          aria-label="Descargar archivo"
          className="flex h-8 w-8 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        {movible && <MenuMover item={movible} />}
        {onDeleted && <DeleteFileButton archivoId={archivo.id} onEliminado={onDeleted} />}
        {onClose && (
          <WindowAction label="Cerrar vista ampliada" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </WindowAction>
        )}
      </div>
    </header>
  );
}

/** Mismo destino que arrastrar la fila o la carpeta, pero por menú: el camino que queda cuando no hay ratón. */
function MenuMover({ item, compacto = false }: { item: Arrastre; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const que = item.tipo === "carpeta" ? `la carpeta ${item.nombre}` : item.nombre;

  return (
    <DropdownMenu modal={false} open={abierto} onOpenChange={setAbierto}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Mover a otra carpeta"
          aria-label={`Mover ${que} a otra carpeta`}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white",
            compacto ? "h-6 w-6 text-white/45" : "h-8 w-8 text-white/65"
          )}
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-entity-sheet-portal align="end" className="z-[101] w-60 p-2.5">
        <ListaDestinos item={item} onElegido={() => setAbierto(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteFileButton({ archivoId, onEliminado }: { archivoId: string; onEliminado: () => void }) {
  const [estado, setEstado] = useState<"idle" | "confirmando" | "eliminando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEstado("eliminando");
    setError(null);
    try {
      const response = await fetch(`/api/archivos/${archivoId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}) as { error?: string });
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar el archivo");
      onEliminado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el archivo");
      setEstado("error");
    }
  }

  if (estado !== "idle") {
    return (
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/10 pl-2" role="group" aria-label="Confirmar eliminación de archivo">
        <span className="max-w-[110px] truncate text-[10px] font-medium text-red-200" title={error ?? undefined}>
          {estado === "error" ? error ?? "No se pudo eliminar" : "¿Eliminar?"}
        </span>
        {estado !== "error" && (
          <button
            type="button"
            onClick={confirmar}
            disabled={estado === "eliminando"}
            title="Confirmar eliminación"
            aria-label="Confirmar eliminación"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {estado === "eliminando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sí"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEstado("idle")}
          title={estado === "error" ? "Cerrar" : "Cancelar"}
          aria-label={estado === "error" ? "Cerrar mensaje" : "Cancelar eliminación"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <WindowAction label="Eliminar archivo" onClick={() => setEstado("confirmando")}>
      <Trash2 className="h-3.5 w-3.5" />
    </WindowAction>
  );
}

export function WindowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </button>
  );
}

function FileContent({ archivo, large = false }: { archivo: Archivo; large?: boolean }) {
  const url = `/api/archivos/${archivo.id}`;
  const kind = fileKind(archivo.mime);
  const sharedClass = "h-full w-full rounded-lg border border-white/[0.06] bg-white";

  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- la URL pasa por una ruta autenticada y redirige a R2
    return <img src={url} alt={archivo.nombre_original} className="h-full w-full rounded-lg object-contain" />;
  }
  if (kind === "pdf") {
    return <iframe src={`${url}#toolbar=${large ? 1 : 0}&navpanes=0`} title={archivo.nombre_original} className={sharedClass} loading="lazy" />;
  }
  if (kind === "text") {
    return <iframe src={url} title={archivo.nombre_original} className={sharedClass} loading="lazy" />;
  }
  if (kind === "video") {
    return <video src={url} controls className="h-full w-full rounded-lg bg-black object-contain" />;
  }
  if (kind === "audio") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg bg-black/25 px-8 text-center">
        <Music2 className="h-10 w-10 text-white/55" />
        <p className="text-[12px] text-white/85">{archivo.nombre_original}</p>
        <audio src={url} controls className="w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg bg-black/25 px-8 text-center">
      <Paperclip className="h-9 w-9 text-white/55" />
      <div>
        <p className="text-[12px] font-medium text-white/90">Vista previa no disponible</p>
        <p className="mt-1 text-[10px] leading-4 text-white/65">Puedes descargar el archivo para abrirlo con su aplicación compatible.</p>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-medium text-white/85 hover:bg-white/[0.1]">
        Descargar {extensionOf(archivo.nombre_original)}
      </a>
    </div>
  );
}

/**
 * Vista previa "desnuda" de un único archivo: sin barra de título ni nombre
 * repetido (el llamador ya lo muestra en su propia fila/encabezado). La usa
 * el panel de "Documentos y relaciones" (nivel 3) cuando una fila tiene
 * exactamente un archivo — reutiliza `FileContent` para el contenido
 * embebido y el mismo patrón de portal que `ArchivosAdjuntos` para "ampliar
 * dentro del panel", controlado aquí desde afuera (los íconos de acción
 * viven en la fila, no en este componente).
 */
export function FilePreviewDesnuda({
  archivo,
  maximizado,
  onCerrarMaximizado,
}: {
  archivo: Archivo;
  maximizado: boolean;
  onCerrarMaximizado: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!maximizado) return;
    const host = rootRef.current?.closest<HTMLElement>("[data-entity-sheet-window]") ?? document.body;
    setPortalHost(host);

    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCerrarMaximizado();
    }

    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [maximizado, onCerrarMaximizado]);

  const overlay = maximizado && portalHost && createPortal(
    <div
      className={cn(
        "embedded-file-window z-[80] flex flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0b0d16]/[0.98] shadow-[0_28px_90px_rgba(0,0,0,.72)] backdrop-blur-2xl",
        portalHost === document.body ? "fixed inset-2 sm:inset-6" : "absolute inset-2 sm:inset-3"
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista ampliada de ${archivo.nombre_original}`}
    >
      <header className="flex min-h-[54px] items-center gap-3 bg-white/[0.025] px-3">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{archivo.nombre_original}</span>
        <WindowAction label="Cerrar vista ampliada" onClick={onCerrarMaximizado}>
          <X className="h-3.5 w-3.5" />
        </WindowAction>
      </header>
      <div className="min-h-0 flex-1 bg-black/30 p-1.5 sm:p-3">
        <FileContent archivo={archivo} large />
      </div>
    </div>,
    portalHost
  );

  return (
    <div ref={rootRef} className="h-[220px] rounded-lg border border-white/[0.06] bg-black/25 p-1.5 sm:h-[320px] sm:p-2.5">
      <FileContent archivo={archivo} />
      {overlay}
    </div>
  );
}

export type SubirArchivosHandle = { abrirSelector: () => void };

/**
 * Zona de arrastrar y soltar + botón para subir archivos directo desde la
 * interfaz. No sabe nada de carpetas: sube siempre a `carpeta` (ya resuelta
 * por quien la usa) o a la raíz si no viene. Cuando además hay que elegir o
 * crear una subcarpeta, usar `SubirConCarpeta`, que la envuelve.
 */
export const SubirArchivos = forwardRef<SubirArchivosHandle, {
  entidadTipo: string;
  entidadId: string;
  onSubido?: (archivo: Archivo) => void;
  etiqueta?: string;
  /** Ruta de carpeta ya resuelta donde caen los archivos; sin ella, quedan sueltos en la raíz. */
  carpeta?: string;
  /** Dropzone más chica, para cuando ya comparte espacio con el selector de subcarpeta. */
  compacta?: boolean;
}>(function SubirArchivos({
  entidadTipo,
  entidadId,
  onSubido,
  etiqueta = "Subir archivos",
  carpeta,
  compacta = false,
}, ref) {
  const rol = useAcceso(entidadTipo);
  const puedeSubir = (puedeEscribir(rol) && puedeEscribir(rol, "documentos"));
  const subidas = useSubidas();
  const [arrastrando, setArrastrando] = useState(false);

  // El destino se arma en cada disparo (no se memoriza): `carpeta` y
  // `onSubido` cambian según dónde esté montado este dropzone.
  const destino = () => ({ entidadTipo, entidadId, carpeta, onSubido });

  useImperativeHandle(ref, () => ({
    abrirSelector: () => {
      if (puedeSubir) subidas.abrirSelector(destino());
    },
  }));

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastrando(false);
    if (!puedeSubir) return;
    subidas.subirArrastre(event.dataTransfer, destino());
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (puedeSubir) setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
        compacta ? "gap-1.5 px-3 py-3" : "gap-2 px-4 py-6",
        !puedeSubir
          ? "cursor-not-allowed border-white/[0.08] opacity-50"
          : arrastrando
            ? "border-brand-400/60 bg-brand-500/[0.06]"
            : "border-white/[0.14] hover:border-white/25"
      )}
    >
      {!compacta && <UploadCloud className="h-5 w-5 text-white/45" />}
      {puedeSubir ? (
        !compacta && <p className="text-[11px] text-white/60">Arrastra archivos aquí o</p>
      ) : (
        <p className="text-[11px] text-white/60">No tienes permiso para subir archivos</p>
      )}
      {puedeSubir && (
        <button
          type="button"
          onClick={() => subidas.abrirSelector(destino())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/[0.1]"
        >
          <Plus className="h-3.5 w-3.5" />
          {etiqueta}
        </button>
      )}
    </div>
  );
});

type ModoSubida = "documento" | "subcarpeta";

/**
 * Envoltorio de `SubirArchivos` para cuando además se puede elegir o crear
 * una subcarpeta: separa las dos acciones en pestañas ("Documento" /
 * "Subcarpeta") en vez de mezclar un campo de texto y un dropzone en un solo
 * formulario ambiguo, con un orden fijo — elegir qué hacer, después
 * completarlo. En modo "Subcarpeta" la carpeta se persiste primero, incluso
 * si el usuario decide no subir ningún archivo después.
 */
export function SubirConCarpeta({
  entidadTipo,
  entidadId,
  onSubido,
  onCarpetaCreada,
  etiqueta,
  carpetaBase,
  carpetasSugeridas = [],
  subirArchivosRef,
}: {
  entidadTipo: string;
  entidadId: string;
  onSubido?: (archivo: Archivo) => void;
  onCarpetaCreada?: (ruta: string) => void;
  etiqueta?: string;
  /** Carpeta donde cae el modo "Documento" y bajo la que se anida la subcarpeta nueva; sin ella, la raíz. */
  carpetaBase?: string;
  carpetasSugeridas?: string[];
  subirArchivosRef?: React.Ref<SubirArchivosHandle>;
}) {
  const [modo, setModo] = useState<ModoSubida>("documento");
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [carpetaPreparada, setCarpetaPreparada] = useState<string | null>(null);
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [errorCarpeta, setErrorCarpeta] = useState<string | null>(null);
  const [aperturaPendiente, setAperturaPendiente] = useState(false);
  const carpetaListId = useId();
  const innerRef = useRef<SubirArchivosHandle>(null);

  // El "+" de la fila usa `subirArchivosRef` para abrir el selector directo,
  // sin pasar por este formulario. Si el modo activo es "Subcarpeta" sin
  // nombre, `SubirArchivos` ni siquiera está montado (ver más abajo), así
  // que primero hay que volver a "Documento" y recién en el próximo render
  // — ya con el dropzone montado — abrir el selector.
  useImperativeHandle(subirArchivosRef, () => ({
    abrirSelector: () => {
      setModo("documento");
      setAperturaPendiente(true);
    },
  }), []);

  useEffect(() => {
    if (!aperturaPendiente || modo !== "documento") return;
    innerRef.current?.abrirSelector();
    setAperturaPendiente(false);
  }, [aperturaPendiente, modo]);

  const nombrePadre = carpetaBase?.split("/").pop();
  const nombreLimpio = nombreCarpeta.trim();
  const esCarpetaExistente = nombreLimpio.length > 0 && carpetasSugeridas.some(
    (ruta) => ruta.toLocaleLowerCase("es-PE") === nombreLimpio.toLocaleLowerCase("es-PE")
  );
  const rutaPropuesta = nombreLimpio
    ? (carpetaBase ? `${carpetaBase}/${nombreLimpio}` : nombreLimpio)
    : "";
  const nombreInvalido = nombreLimpio.includes("/") || /[\u0000-\u001f\u007f]/.test(nombreLimpio);
  const carpetaDestino = modo === "subcarpeta" ? carpetaPreparada ?? undefined : carpetaBase;

  async function prepararCarpeta(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!rutaPropuesta || nombreInvalido || creandoCarpeta) return;
    setCreandoCarpeta(true);
    setErrorCarpeta(null);
    const resultado = await crearCarpetaArchivo(entidadTipo, entidadId, rutaPropuesta);
    setCreandoCarpeta(false);
    if (!resultado.ok) {
      setErrorCarpeta(resultado.error);
      return;
    }
    setCarpetaPreparada(rutaPropuesta);
    onCarpetaCreada?.(rutaPropuesta);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="tablist" aria-label="Qué agregar">
        <BotonModo activo={modo === "documento"} onClick={() => setModo("documento")}>
          <Paperclip className="h-3.5 w-3.5" />
          Documento
        </BotonModo>
        <BotonModo activo={modo === "subcarpeta"} onClick={() => setModo("subcarpeta")}>
          <FolderPlus className="h-3.5 w-3.5" />
          Subcarpeta
        </BotonModo>
      </div>

      {modo === "subcarpeta" && (
        <form onSubmit={prepararCarpeta}>
          <label htmlFor={carpetaListId} className="mb-1 block text-[11px] font-medium text-white/75">
            {carpetaBase ? `Nombre de la subcarpeta dentro de "${nombrePadre}"` : "Nombre de la carpeta"}
          </label>
          <input
            id={carpetaListId}
            list={`${carpetaListId}-sugerencias`}
            value={nombreCarpeta}
            onChange={(event) => {
              setNombreCarpeta(event.target.value);
              setCarpetaPreparada(null);
              setErrorCarpeta(null);
            }}
            placeholder="Ej: 2026"
            maxLength={60}
            autoFocus
            className="view-control h-9 w-full"
          />
          <datalist id={`${carpetaListId}-sugerencias`}>
            {carpetasSugeridas.map((ruta) => (
              <option key={ruta} value={ruta} />
            ))}
          </datalist>
          <p className="mt-1 text-[10.5px] leading-snug text-white/45">
            {carpetaPreparada === rutaPropuesta
              ? `La carpeta "${nombreLimpio}" ya está creada. Puedes dejarla vacía o agregarle archivos.`
              : nombreLimpio
              ? esCarpetaExistente
                ? `La subcarpeta "${nombreLimpio}" ya existe; puedes seleccionarla para agregar archivos.`
                : `Se creará "${nombreLimpio}" aunque no subas ningún archivo.`
              : "Escribe un nombre para crear la subcarpeta."}
          </p>
          {nombreInvalido && (
            <p className="mt-1 text-[10.5px] text-red-300">Usa un solo nombre, sin barras ni caracteres de control.</p>
          )}
          {errorCarpeta && <p className="mt-1 text-[10.5px] text-red-300">{errorCarpeta}</p>}
          {carpetaPreparada !== rutaPropuesta && (
            <button
              type="submit"
              disabled={!nombreLimpio || nombreInvalido || creandoCarpeta}
              className="glass-btn-primary mt-2 h-8 w-full justify-center text-[11px] disabled:opacity-50"
            >
              {creandoCarpeta && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {esCarpetaExistente ? "Usar subcarpeta" : "Crear subcarpeta"}
            </button>
          )}
        </form>
      )}

      {(modo === "documento" || carpetaPreparada === rutaPropuesta) && (
        <SubirArchivos
          ref={innerRef}
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          onSubido={onSubido}
          etiqueta={etiqueta}
          carpeta={carpetaDestino}
          compacta
        />
      )}
    </div>
  );
}

function BotonModo({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
        activo
          ? "border-brand-400/40 bg-brand-500/[0.12] text-white"
          : "border-white/10 bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white/80"
      )}
    >
      {children}
    </button>
  );
}
