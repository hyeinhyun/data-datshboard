/** Public URL for a sample image (optionally a thumbnail). Pure: safe for client bundles. */
export function imageUrl(relative: string, width?: number): string {
  const encoded = relative
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/images/${encoded}${width ? `?w=${width}` : ""}`;
}
