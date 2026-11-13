export interface NewsSession {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

export interface AdAccountRestriction {
  restricted: boolean;
  status: string;
  reason: string;
  until: string | null;
}

export const NEWS_STEPS = ["Media", "Title", "Content", "Targeting", "Preview"];

export const HIGHLIGHT_MAX_WORDS = 50;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Keeps at most `max` words while preserving the user's spacing on the kept part. */
export function clampToWords(text: string, max: number): string {
  if (countWords(text) <= max) return text;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  let n = 0;
  let end = 0;
  while ((match = re.exec(text)) !== null) {
    n += 1;
    end = match.index + match[0].length;
    if (n === max) break;
  }
  return text.slice(0, end);
}

export function capitalizeFirst(txt: string): string {
  return txt.trim() ? txt.trim().charAt(0).toUpperCase() + txt.trim().slice(1) : "";
}
