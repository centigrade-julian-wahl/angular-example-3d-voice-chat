export interface MessagePart {
  text: string;
  href?: string;
  booking?: boolean;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)}\]]+$/;

export function messageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const urlText = rawUrl.replace(TRAILING_PUNCTUATION, '');
    const start = match.index ?? 0;

    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    if (urlText) {
      try {
        const url = new URL(urlText);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          parts.push({
            text: urlText,
            href: url.href,
            ...(url.hostname === 'bookings.cloud.microsoft' ? { booking: true } : {}),
          });
        } else {
          parts.push({ text: urlText });
        }
      } catch {
        parts.push({ text: urlText });
      }
    }
    if (rawUrl.length > urlText.length) parts.push({ text: rawUrl.slice(urlText.length) });
    cursor = start + rawUrl.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length ? parts : [{ text }];
}