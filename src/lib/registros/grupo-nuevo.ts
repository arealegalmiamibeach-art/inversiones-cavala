/**
 * Reglas de la fila "+ Nuevo …" que cada tabla ofrece al pie de un grupo.
 *
 * Viven aparte del componente (`NuevoEnGrupo`) para poder probarlas sin React:
 * este botón ya desapareció más de una vez —la última, al agrupar por la
 * columna de título— y sólo una prueba evita que vuelva a pasar.
 */

/** Lo que estas reglas necesitan saber de `CONFIG_CREAR[clave]`. */
export type ConfigGrupoNuevo = {
  /** Campo de la base que hace de título (`nombre`, `placa`, `expediente`). */
  campoTitulo?: string;
  /** Id de la columna visual de título cuando no coincide con el campo. */
  columnaTitulo?: string;
  /** Columna de la tabla → campo de la base donde se copia el valor del grupo. */
  camposAgrupacion: Record<string, string>;
};

export type GrupoNuevoBasico = {
  /** Columna por la que está agrupada la tabla; null en grupos personalizados. */
  columnId: string | null;
  /** Valor crudo del grupo (vacío en "Sin valor"). */
  valor: string;
};

/** Id de la columna visual que hace de título de la fila (Contrato, Nombre, Placa…). */
export function columnaTituloDe(config: Pick<ConfigGrupoNuevo, "campoTitulo" | "columnaTitulo">): string | undefined {
  return config.columnaTitulo ?? config.campoTitulo;
}

/**
 * ¿La tabla está agrupada por su propia columna de título? Ahí cada grupo es un
 * nombre (p. ej. "CAVALA-DIPIER" con sus 9 contratos) y "+ Nuevo" agrega otro
 * registro con ese mismo nombre: el nombre del grupo *es* el título, así que
 * no hay un segundo campo que precargar.
 */
export function agrupadoPorTitulo(
  config: Pick<ConfigGrupoNuevo, "campoTitulo" | "columnaTitulo">,
  columnId: string | null
): boolean {
  return columnId !== null && columnId === columnaTituloDe(config);
}

/**
 * Texto con el que arranca el input de "+ Nuevo": el nombre del grupo cuando se
 * agrupa por título (Enter crea otro registro con ese nombre; escribir encima
 * lo manda a otro grupo) y vacío en cualquier otra agrupación.
 */
export function tituloInicialEnGrupo(config: ConfigGrupoNuevo, grupo: GrupoNuevoBasico): string {
  return agrupadoPorTitulo(config, grupo.columnId) ? grupo.valor : "";
}

/**
 * Campo de la base donde se copia el valor del grupo al crear el registro, o
 * `undefined` si no aplica: columnas sin campo propio (relaciones, calculadas)
 * y la columna de título, cuyo valor lo escribe la persona en el input.
 */
export function campoAgrupadoDe(config: ConfigGrupoNuevo, columnId: string | null): string | undefined {
  if (columnId === null || agrupadoPorTitulo(config, columnId)) return undefined;
  return Object.prototype.hasOwnProperty.call(config.camposAgrupacion, columnId)
    ? config.camposAgrupacion[columnId]
    : undefined;
}
