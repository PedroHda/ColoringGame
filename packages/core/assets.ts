/** Portable backups refer only to bundled artwork, never arbitrary URLs. */
export function isArtworkAsset(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\/(illustrations\/p\d{2}-s\d{2}\.png|clothing\/[a-z][a-z0-9-]{0,63}\.svg)$/.test(
      value,
    )
  );
}
