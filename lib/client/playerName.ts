export const NAME_MAX = 12;

/** Trim, collapse spaces, cap length. Empty means the confirm button stays dark. */
export function sanitizePlayerName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
