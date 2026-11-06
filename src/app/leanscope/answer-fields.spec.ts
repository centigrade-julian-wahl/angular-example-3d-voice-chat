import type { PendingQuestion } from './agent-server.types';
import { answerFields, toAnswer } from './answer-fields';

const question = (q: Partial<PendingQuestion>): PendingQuestion => ({
  guid: 's1',
  fieldKeys: [],
  required: [],
  ...q,
});

describe('answerFields', () => {
  it('answers a plain-text prompt with one message field', () => {
    const fields = answerFields(
      question({
        schema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
        fieldKeys: ['message'],
        required: ['message'],
      }),
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      key: 'message',
      kind: 'text',
      required: true,
      label: 'Your answer',
    });
  });

  it('falls back to a message field without a schema', () => {
    expect(answerFields(question({}))[0]).toMatchObject({ key: 'message', kind: 'text' });
  });

  it('derives kinds, choices and prefill from the schema', () => {
    const fields = answerFields(
      question({
        schema: {
          properties: {
            fullName: { type: 'string' },
            age: { type: 'integer' },
            agrees: { type: 'boolean' },
            size: { enum: ['S', 'M'] },
            plan: {
              oneOf: [
                { const: 'a', title: 'Plan A' },
                { const: 'b', title: 'Plan B' },
              ],
            },
            address: { type: 'object' },
          },
        },
        fieldKeys: ['fullName', 'age', 'agrees', 'size', 'plan', 'address'],
        required: ['fullName'],
        prefill: { fullName: 'Ada' },
      }),
    );
    expect(fields.map((f) => f.kind)).toEqual([
      'text',
      'number',
      'boolean',
      'choice',
      'choice',
      'json',
    ]);
    expect(fields[0]).toMatchObject({ label: 'Full Name', required: true, initial: 'Ada' });
    expect(fields[4].choices).toEqual([
      { value: 'a', label: 'Plan A' },
      { value: 'b', label: 'Plan B' },
    ]);
  });
});

describe('toAnswer', () => {
  const fields = answerFields(
    question({
      schema: {
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          extra: { type: 'object' },
        },
      },
      fieldKeys: ['name', 'age', 'extra'],
    }),
  );

  it('converts values and leaves out empty optional fields', () => {
    expect(toAnswer(fields, { name: 'Ada', age: '36', extra: '' })).toEqual({
      name: 'Ada',
      age: 36,
    });
    expect(toAnswer(fields, { name: '', age: '', extra: '{"a":1}' })).toEqual({ extra: { a: 1 } });
  });

  it('names a JSON field that does not parse', () => {
    expect(() => toAnswer(fields, { extra: '{' })).toThrow('"Extra" is not valid JSON.');
  });
});
