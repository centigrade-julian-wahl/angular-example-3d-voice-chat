import { answerText } from './transcript';

describe('answerText', () => {
  it('unwraps the server envelope and shows only the message', () => {
    const line = JSON.stringify({
      kind: 'review',
      schema: { type: 'object', properties: { message: { type: 'string' } }, readOnly: true },
      data: { message: 'How is your job?\n' },
    });
    expect(answerText(line)).toBe('How is your job?');
  });

  it('shows a picked choice by its title', () => {
    const line = JSON.stringify({
      kind: 'review',
      schema: {
        properties: { selectedNeed: { oneOf: [{ const: 'g-1', title: 'Gespräch beenden' }] } },
      },
      data: { selectedNeed: 'g-1' },
    });
    expect(answerText(line)).toBe('Gespräch beenden');
  });

  it('handles plain answers, several fields and non-JSON lines', () => {
    expect(answerText('{"message":"Hi"}')).toBe('Hi');
    expect(answerText('{"name":"Ada","age":36}')).toBe('name: Ada\nage: 36');
    expect(answerText('not json')).toBe('not json');
  });
});
