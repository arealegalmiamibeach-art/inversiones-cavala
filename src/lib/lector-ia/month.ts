const LIMA_UTC_OFFSET_HOURS = 5;

export function limaMonthWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return {
    start: new Date(Date.UTC(year, month - 1, 1, LIMA_UTC_OFFSET_HOURS)),
    next: new Date(Date.UTC(year, month, 1, LIMA_UTC_OFFSET_HOURS)),
  };
}
