"use client";

import { createContext, useContext } from "react";

/** El formato de presentación nunca debe sustituir el control que guarda el dato. */
export const FormatoCeldaContext = createContext<((valor: string) => React.ReactNode) | null>(null);
export function useFormatoCelda() { return useContext(FormatoCeldaContext); }
