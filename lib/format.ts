// Pure display helpers shared by client components (no browser APIs, no I/O).

/**
 * `3 rows`, `1 row`, `6 catches` — keeps the import summary readable (#237).
 * Regular English plurals only: -es after s, sh, ch, x, z; -s otherwise.
 */
export const plural = (count: number, singular: string) => {
  if (count === 1) return `${count} ${singular}`;
  const suffix = /(s|sh|ch|x|z)$/.test(singular) ? "es" : "s";
  return `${count} ${singular}${suffix}`;
};

/** `18.11.2026, 14:14` (de-AT); `Unknown` for an unparsable value. */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
