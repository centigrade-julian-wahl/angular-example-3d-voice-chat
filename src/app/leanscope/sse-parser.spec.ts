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
});
