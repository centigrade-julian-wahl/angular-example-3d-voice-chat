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

export type BlinkTarget =
  | { kind: 'none' }
  | {
      kind: 'shader';
      parameter: string;
      leftCenter: [number, number, number];
      rightCenter: [number, number, number];
      halfWidth: number;
      halfHeight: number;
      depth: number;
      lidColor: [number, number, number];
      creaseColor: [number, number, number];
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
  blink: BlinkTarget;
}

/** This Wichtel has no facial shape keys; the mouth is drawn by its material shader. */
export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  modelUrl: '/wichtel-rigged.glb',
  size: 4,
  states: { idle: 'idle.001', listening: 'idle.001', thinking: 'wait.001', speaking: 'idle.001' },
  emotions: {
    laugh: 'laugh_01.001',
    agree: 'agree.001',
    angry: 'angry_01.001',
    bow: 'bow.001',
    heart: 'heart_pose.001',
    flip: 'flip.001',
  },
  mouth: {
    kind: 'shader',
    parameter: 'mouthOpen',
    center: [0, 0.46, 0.163],
    horizontalAxis: 'x',
    verticalAxis: 'y',
    depthAxis: 'z',
    width: 0.035,
    closedHeight: 0.0015,
    openHeight: 0.018,
    depth: 0.045,
  },
  blink: {
    kind: 'shader',
    parameter: 'eyeBlink',
    leftCenter: [-0.075, 0.55, 0.145],
    rightCenter: [0.075, 0.55, 0.145],
    halfWidth: 0.05,
    halfHeight: 0.06,
    depth: 0.15,
    lidColor: [0.1, 0.22, 0.55],
    creaseColor: [0.025, 0.07, 0.18],
  },
};
