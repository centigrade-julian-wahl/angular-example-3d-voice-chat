import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { vi } from 'vitest';
import { CharacterAvatar } from './character-avatar';
import { DEFAULT_CHARACTER_CONFIG, type BlinkTarget, type DriverTarget } from './character-config';

type ShaderTarget = Extract<DriverTarget, { kind: 'shader' }>;
type MaterialShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
interface ShaderRuntime {
  three: typeof THREE;
  bindShaderMouth(model: THREE.Object3D, target: ShaderTarget, blink: BlinkTarget): void;
  applyMouth(level: number): void;
  applyBlink(level: number): void;
}

describe('CharacterAvatar shader mouth', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })));
  afterEach(() => vi.unstubAllGlobals());

  it('uses the rigged Wichtel GLB and its measured glTF face anchor', () => {
    expect(DEFAULT_CHARACTER_CONFIG.modelUrl).toBe('/wichtel-rigged.glb');
    expect(DEFAULT_CHARACTER_CONFIG.states).toEqual({
      idle: 'idle.001',
      listening: 'idle.001',
      thinking: 'wait.001',
      speaking: 'idle.001',
    });
    expect(DEFAULT_CHARACTER_CONFIG.emotions.flip).toBe('flip.001');
    expect(DEFAULT_CHARACTER_CONFIG.mouth).toMatchObject({
      kind: 'shader',
      center: [0, 0.46, 0.163],
      horizontalAxis: 'x',
      verticalAxis: 'y',
      depthAxis: 'z',
    });
    expect(DEFAULT_CHARACTER_CONFIG.blink).toMatchObject({
      kind: 'shader',
      parameter: 'eyeBlink',
      leftCenter: [-0.075, 0.55, 0.145],
      rightCenter: [0.075, 0.55, 0.145],
      halfWidth: 0.05,
      halfHeight: 0.06,
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(CharacterAvatar);
    const runtime = fixture.componentInstance as unknown as ShaderRuntime;
    runtime.three = THREE;
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    const target = DEFAULT_CHARACTER_CONFIG.mouth as ShaderTarget;
    const blink = DEFAULT_CHARACTER_CONFIG.blink;
    runtime.bindShaderMouth(mesh, target, blink);
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as MaterialShader;
    const compile = () => material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    fixture.destroy();
    geometry.dispose();
    material.dispose();
    return { runtime, material, shader, compile };
  }

  it('anchors the mask to the undeformed surface before skinning', () => {
    const { shader, compile } = setup();
    compile();
    const anchor = shader.vertexShader.indexOf('vMouthLocalPosition = position;');
    expect(anchor).toBeGreaterThan(-1);
    expect(anchor).toBeLessThan(shader.vertexShader.indexOf('#include <skinning_vertex>'));
    expect(shader.vertexShader).not.toContain('vMouthLocalPosition = transformed;');
    expect(shader.fragmentShader).toContain('vec3(0, 0.46, 0.163)');
    expect(shader.fragmentShader).toContain('float leftIncisor');
    expect(shader.fragmentShader).toContain('float rightIncisor');
    expect(shader.fragmentShader).toContain('float lowerIncisor');
    expect(shader.fragmentShader).toContain('smoothstep(0.2, 0.55, clamp(u_mouthOpen, 0.0, 1.0))');
    expect(shader.fragmentShader).toContain('uniform float u_eyeBlink;');
    expect(shader.fragmentShader).toContain('float leftEyeMask');
    expect(shader.fragmentShader).toContain('float rightEyeMask');
  });

  it('updates the compiled audio uniform and clamps the opening', () => {
    const { runtime, shader, compile } = setup();
    compile();
    for (const [level, expected] of [[-1, 0], [0.45, 0.45], [2, 1], [0, 0]]) {
      runtime.applyMouth(level);
      expect(shader.uniforms['u_mouthOpen'].value).toBe(expected);
    }
  });

  it('updates and clamps the eye-blink shader uniform', () => {
    const { runtime, shader, compile } = setup();
    compile();
    for (const [level, expected] of [[-1, 0], [0.6, 0.6], [2, 1]]) {
      runtime.applyBlink(level);
      expect(shader.uniforms['u_eyeBlink'].value).toBe(expected);
    }
  });

  it('preserves the PBR texture shader and distinguishes its configuration', () => {
    const { material, shader, compile } = setup();
    compile();
    expect(shader.fragmentShader).toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');
    expect(material.customProgramCacheKey()).toContain(JSON.stringify({
      mouth: DEFAULT_CHARACTER_CONFIG.mouth,
      blink: DEFAULT_CHARACTER_CONFIG.blink,
    }));
  });

  it('rejects incompatible shaders instead of silently omitting the mouth', () => {
    const { shader, compile } = setup();
    shader.vertexShader = 'void main() {}';
    expect(compile).toThrow('The material does not support the mouth shader.');
  });
});