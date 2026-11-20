"use client";

import { ProcesosList } from "./procesos-list";

/** SUNAFIL comparte propiedades, relaciones y edición con las demás materias. */
export function SunafilList(props: React.ComponentProps<typeof ProcesosList>) {
  return <ProcesosList {...props} materiaFija="sunafil" mostrarFiltroMateria={false} storageKey="procesos-sunafil" revalidar="/procesos/materia/sunafil" />;
}
