import type { SessionState } from '../../leanscope/leanscope-session.service';
import type { AvatarState } from './character-config';

/** The session never says who is talking, so speech comes from the audio side. */
export type AvatarSourceState = SessionState | 'recording' | 'transcribing' | 'thinking' | 'speaking';

export function mapAvatarState(session: AvatarSourceState, speaking = false): AvatarState {
  if (speaking || session === 'speaking') return 'speaking';
  switch (session) {
    case 'asking':
    case 'recording':
      return 'listening';
    case 'connecting':
    case 'working':
    case 'transcribing':
    case 'thinking':
      return 'thinking';
    default:
      return 'idle';
  }
}
