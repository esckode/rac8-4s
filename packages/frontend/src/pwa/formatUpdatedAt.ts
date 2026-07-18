/** "Updated HH:MM" in the viewer's local time (D4), zero-padded 24h clock. */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `Updated ${hh}:${mm}`
}
