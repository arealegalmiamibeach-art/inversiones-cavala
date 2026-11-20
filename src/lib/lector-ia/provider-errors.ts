export type LectorProviderFailure = { status?: number; retryAfter?: string | null; timeout?: boolean; creditExhausted?: boolean };

export function lectorProviderError(failures: LectorProviderFailure[]): { status: number; error: string; headers: Record<string, string> } {
  // Credit-exhausted is a real, permanent-for-now state (not a transient outage):
  // report it plainly instead of the generic "service unavailable" message.
  if (failures.length > 0 && failures.every((failure) => failure.creditExhausted)) {
    return {
      status: 402,
      error: "Se acabó el crédito disponible del modo experto por ahora. Puedes seguir usando el modo estándar.",
      headers: { "Cache-Control": "no-store" },
    };
  }
  // A fallback may fail differently: report rate limits only if every provider
  // that was tried was rate-limited, rather than promising a misleading retry.
  if (failures.length > 0 && failures.every((failure) => failure.status === 429)) {
    const seconds = failures.map(({ retryAfter }) => {
      if (!retryAfter) return 60;
      const numeric = Number(retryAfter);
      const value = Number.isFinite(numeric) ? numeric : (Date.parse(retryAfter) - Date.now()) / 1_000;
      return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 60;
    });
    const retryAfter = Math.min(...seconds);
    return {
      status: 429,
      error: "Se alcanzó el límite temporal del servicio de IA. Espera un momento y vuelve a intentar.",
      headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    };
  }
  if (failures.some((failure) => failure.timeout || failure.status === 504 || failure.status === 408)) {
    return { status: 504, error: "El servicio de IA tardó demasiado en responder. Vuelve a intentar.", headers: { "Cache-Control": "no-store" } };
  }
  return { status: 502, error: "El servicio de IA no está disponible en este momento. Vuelve a intentar.", headers: { "Cache-Control": "no-store" } };
}
