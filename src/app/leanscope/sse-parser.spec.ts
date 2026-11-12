import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('parses named frames and skips heartbeats', () => {
    const parser = new SseParser();
    const frames = parser.push(': heartbeat\n\nevent: gate\ndata: {"state":"open"}\n\n');
    expect(frames).toEqual([{ event: 'gate', data: { state: 'open' } }]);
  });

  it('keeps an unfinished frame until the next chunk completes it', () => {
    const parser = new SseParser();
    expect(parser.push('event: step\ndata: {"guid":')).toEqual([]);
    expect(parser.push('"a"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'step', data: { guid: 'a' } }]);
  });

  it('joins multi-line data, accepts CRLF and defaults the event name', () => {
    const parser = new SseParser();
    const frames = parser.push('data: {"a":\r\ndata: 1}\r\n\r\n');
    expect(frames).toEqual([{ event: 'message', data: { a: 1 } }]);
  });

  it('drops frames whose data is not JSON', () => {
    expect(new SseParser().push('event: x\ndata: not json\n\n')).toEqual([]);
  });

  it('preserves native voice frames across fragmented chunks and heartbeats', () => {
    const expected = [
      { event: 'actors', data: { actors: [{ guid: 'persona-1', resources: [] }] } },
      { event: 'tts_audio', data: {
        stepGuid: 'step-1', audioBase64: 'YXVkaW8=', mimeType: 'audio/mpeg',
        alignment: { characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.2] },
      } },
      { event: 'tts_audio_end', data: { stepGuid: 'step-1', chunks: 1 } },
      { event: 'session_ending', data: { reason: 'terminal' } },
    ];
    const wire = expected.map((frame) => `: heartbeat\n\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`).join('');
    const parser = new SseParser();
    const received = [];
    for (let offset = 0; offset < wire.length; offset += 7) {
      received.push(...parser.push(wire.slice(offset, offset + 7)));
    }
    expect(received).toEqual(expected);
  });
});
