"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  paramName?: string;
}

export function SearchInput({
  placeholder = "Buscar...",
  paramName = "q",
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get(paramName) ?? "");
  const [pendiente, iniciar] = useTransition();

  const handleChange = useCallback(
    (value: string) => {
      setValor(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(paramName, value);
      } else {
        params.delete(paramName);
      }
      params.delete("pagina"); // reset página al buscar
      iniciar(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams, paramName]
  );

  return (
    <div className="relative w-full sm:w-auto">
      <Search className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none transition-colors", pendiente ? "text-brand-300" : "text-white/35")} />
      <input
        type="text"
        aria-label={placeholder}
        maxLength={120}
        value={valor}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn("glass-input w-full pl-9 sm:w-72", valor && "pr-9")}
      />
      {valor && (
        <button
          type="button"
          onClick={() => handleChange("")}
          title="Limpiar búsqueda"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
