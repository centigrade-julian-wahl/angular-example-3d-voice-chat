import type { SseFrame } from './agent-server.types';

/**
 * Turns the text chunks of a Server-Sent Events stream into frames.
 *
 * The app reads `GET …/events` with `fetch` rather than `EventSource`, so it can abort the stream
 * and see HTTP errors. Chunks can end anywhere, also in the middle of a line; `push` keeps the
 * unfinished rest until the next chunk completes it. Comment lines (`: heartbeat`) are skipped.
 */
export class SseParser {
  private buffer = '';

  /** Feeds one chunk; returns the frames it completed. Frames whose data isn't JSON are dropped. */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const frames: SseFrame[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end !== -1) {
      const frame = parseFrame(this.buffer.slice(0, end));
      if (frame) frames.push(frame);
      this.buffer = this.buffer.slice(end + 2);
      end = this.buffer.indexOf('\n\n');
    }
    return frames;
  }
}

function parseFrame(block: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value.trim();
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null;
  }
}

/** Reads a `fetch` response body as SSE frames until the stream ends or is aborted. */
export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}
