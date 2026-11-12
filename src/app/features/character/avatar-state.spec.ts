import { mapAvatarState } from './avatar-state';

describe('mapAvatarState', () => {
  it('listens while the session waits for the user', () => {
    expect(mapAvatarState('asking')).toBe('listening');
  });

  it('thinks while the agents work or connect', () => {
    expect(mapAvatarState('working')).toBe('thinking');
    expect(mapAvatarState('connecting')).toBe('thinking');
    expect(mapAvatarState('transcribing')).toBe('thinking');
    expect(mapAvatarState('thinking')).toBe('thinking');
  });

  it('listens while recording and speaks for a speech state', () => {
    expect(mapAvatarState('recording')).toBe('listening');
    expect(mapAvatarState('speaking')).toBe('speaking');
  });

  it('idles when nothing runs', () => {
    for (const state of ['idle', 'waiting', 'ended', 'error'] as const) {
      expect(mapAvatarState(state)).toBe('idle');
    }
  });

  it('speaks whenever audio plays, whatever the session says', () => {
    expect(mapAvatarState('working', true)).toBe('speaking');
    expect(mapAvatarState('asking', true)).toBe('speaking');
  });
});
