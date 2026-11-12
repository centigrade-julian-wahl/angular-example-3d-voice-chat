import { messageParts } from './message-parts';

describe('messageParts', () => {
  it('links HTTP(S) URLs and preserves surrounding text and punctuation', () => {
    expect(messageParts('Hier ist der Link: https://example.com/termine.')).toEqual([
      { text: 'Hier ist der Link: ' },
      { text: 'https://example.com/termine', href: 'https://example.com/termine' },
      { text: '.' },
    ]);
  });

  it('leaves messages without URLs as plain text', () => {
    expect(messageParts('Das war ein schöner Moment.')).toEqual([
      { text: 'Das war ein schöner Moment.' },
    ]);
  });

  it('does not turn non-HTTP schemes into links', () => {
    expect(messageParts('javascript:alert(1)')).toEqual([
      { text: 'javascript:alert(1)' },
    ]);
  });

  it('marks Microsoft Bookings as an appointment action', () => {
    expect(messageParts('Buche hier: https://bookings.cloud.microsoft/book/CentigradeMeeting')).toEqual([
      { text: 'Buche hier: ' },
      {
        text: 'https://bookings.cloud.microsoft/book/CentigradeMeeting',
        href: 'https://bookings.cloud.microsoft/book/CentigradeMeeting',
        booking: true,
      },
    ]);
  });
});