/** Which part of the model moves when the character speaks or blinks. */
export type DriverTarget =
  | { kind: 'none' }
  | { kind: 'morph'; name: string }
  | { kind: 'bone'; name: string }
  | {
      kind: 'shader';
      parameter: string;
      center: [number, number, number];
      horizontalAxis: 'x' | 'y' | 'z';
      verticalAxis: 'x' | 'y' | 'z';
      depthAxis: 'x' | 'y' | 'z';
      width: number;
      closedHeight: number;
      openHeight: number;
      depth: number;
    };

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AvatarEmotion = 'laugh' | 'agree' | 'angry' | 'bow' | 'heart' | 'wait' | 'flip';

/** Everything the avatar runtime needs to know about one character; nothing model-specific lives in code. */
export interface CharacterConfig {
  modelUrl: string;
  /** Longest model dimension in scene units. */
  size: number;
  /** Looping clip per avatar state; a missing state falls back to `idle`. */
  states: Partial<Record<AvatarState, string>>;
  /** One-shot clip per emotion; a missing emotion is ignored. */
  emotions: Partial<Record<AvatarEmotion, string>>;
  mouth: DriverTarget;
  blink: DriverTarget;
}

/** The Wichtel has no mouth rig; the mouth is drawn by its material shader. */
export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  modelUrl: '/wichtel-2026-03.glb',
  size: 4,
  states: { idle: 'idle.001', listening: 'idle.001', thinking: 'wait.001', speaking: 'idle.001' },
  emotions: {
    laugh: 'laugh_01.001',
    agree: 'agree.001',
    angry: 'angry_01.001',
    bow: 'bow.001',
    heart: 'heart_pose.001',
  },
  mouth: {
    kind: 'shader',
    parameter: 'mouthOpen',
    center: [-0.002123, 0.477035, 0.171081],
    horizontalAxis: 'x',
    verticalAxis: 'y',
    depthAxis: 'z',
    width: 0.028,
    closedHeight: 0.001,
    openHeight: 0.012,
    depth: 0.025,
  },
  blink: { kind: 'none' },
};
