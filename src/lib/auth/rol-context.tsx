"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { seccionEntidad, seccionRuta, type Acceso, type Permisos, type Rol } from "@/lib/auth/roles";

/**
 * El layout del dashboard (Server Component) ya resuelve el rol una vez por
 * request; este contexto lo hace disponible a los componentes de cliente que
 * deciden si mostrarse editables (EditableText, PropertyPill, ...) sin tener
 * que enhebrar `rol` como prop por cada página y tabla que los usa.
 */
const RolContext = createContext<Rol | null>(null);
const AccesoContext = createContext<Acceso>({ rol: null, permisos: {} });

export function RolProvider({ rol, permisos = {}, children }: { rol: Rol | null; permisos?: Permisos; children: React.ReactNode }) {
  return <RolContext.Provider value={rol}><AccesoContext.Provider value={{ rol, permisos }}>{children}</AccesoContext.Provider></RolContext.Provider>;
}

export function useAcceso(entidad?: string): Acceso {
  const acceso = useContext(AccesoContext);
  const pathname = usePathname();
  return { ...acceso, seccion: entidad ? seccionEntidad(entidad) : seccionRuta(pathname) };
}

export function useRol(): Rol | null {
  return useContext(RolContext);
}
