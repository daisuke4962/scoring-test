// Uploaded clip names come from PCs and phones in any language. Keep them readable;
// replace only what a file system or a URL path cannot hold.

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function safeFileName(raw: string, fallback = 'clip.mp4'): string {
  const cleaned = raw
    .normalize('NFC')                                   // macOS hands out decomposed accents (e + ´)
    .replace(/[\p{Cc}<>:"\/\\|?*]+/gu, '_')   // control characters, path separators, Windows-reserved
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');                   // no hidden/relative names, no trailing dot or space (Windows)
  if (!cleaned) return fallback;

  const dot = cleaned.lastIndexOf('.');
  let base = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot) : '';
  if (RESERVED_WINDOWS.test(base)) base = '_' + base;
  // Count characters, not UTF-16 units, so a Japanese or emoji name is never cut mid-character.
  return Array.from(base).slice(0, 60).join('') + Array.from(ext).slice(0, 10).join('');
}

/** `name` with `_<suffix>` before the extension, for when the name is already taken. */
export function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}_${suffix}${name.slice(dot)}` : `${name}_${suffix}`;
}
