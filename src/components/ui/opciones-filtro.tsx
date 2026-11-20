import type { DropdownOption } from "@/components/ui/great-ui-animated-select";
import type { OpcionPill } from "@/components/ui/property-pill";

/** Punto de color de una opción del filtro de la barra (mismo estilo en todas las tablas). */
export function iconoCirculo(relleno: string): DropdownOption["icon"] {
  function Circulo(props: React.SVGProps<SVGSVGElement>) {
    return <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill={relleno} /></svg>;
  }
  return Circulo;
}

/**
 * Opciones del filtro de la barra de una columna con catálogo editable: las
 * vigentes (catálogo o, mientras no se haya editado, las del código) y, al
 * final, los valores que los registros todavía tienen aunque ya no estén en la
 * lista. Así lo que se añade, renombra o elimina en "Editar propiedad" se
 * refleja en el filtro sin tocar la tabla.
 */
export function opcionesDeFiltro(
  vigentes: OpcionPill[],
  valores: (string | null)[],
  etiquetaTodas: string,
  relleno: (valor: string) => string,
): DropdownOption[] {
  const enLista = new Set(vigentes.map((opcion) => opcion.value));
  const sueltos = Array.from(new Set(valores.map((valor) => (valor ?? "").trim()).filter((valor) => valor && !enLista.has(valor))))
    .sort((a, b) => a.localeCompare(b, "es-PE"));
  return [
    { id: "__all__", label: etiquetaTodas, icon: iconoCirculo("rgba(0,0,0,0.15)") },
    ...vigentes.map((opcion) => ({ id: opcion.value, label: opcion.label, icon: iconoCirculo(relleno(opcion.value)) })),
    ...sueltos.map((valor) => ({ id: valor, label: valor, icon: iconoCirculo(relleno(valor)) })),
  ];
}

/** Etiqueta vigente de un valor guardado (para el texto de "Filtros" al exportar). */
export function etiquetaDeOpcion(opciones: OpcionPill[], valor: string): string {
  return valor ? opciones.find((opcion) => opcion.value === valor)?.label ?? valor : "";
}
