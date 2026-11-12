import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { vi } from 'vitest';
import { CharacterAvatar } from './character-avatar';
import { DEFAULT_CHARACTER_CONFIG, type DriverTarget } from './character-config';

type ShaderTarget = Extract<DriverTarget, { kind: 'shader' }>;
type MaterialShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
interface ShaderRuntime {
  three: typeof THREE;
  bindShaderMouth(model: THREE.Object3D, target: ShaderTarget): void;
  applyMouth(level: number): void;
}

describe('CharacterAvatar shader mouth', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })));
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const fixture = TestBed.createComponent(CharacterAvatar);
    const runtime = fixture.componentInstance as unknown as ShaderRuntime;
    runtime.three = THREE;
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    const target = DEFAULT_CHARACTER_CONFIG.mouth as ShaderTarget;
    runtime.bindShaderMouth(mesh, target);
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
    expect(shader.fragmentShader).toContain('vec3(-0.002123, 0.477035, 0.171081)');
  });

  it('updates the compiled audio uniform and clamps the opening', () => {
    const { runtime, shader, compile } = setup();
    compile();
    for (const [level, expected] of [[-1, 0], [0.45, 0.45], [2, 1], [0, 0]]) {
      runtime.applyMouth(level);
      expect(shader.uniforms['u_mouthOpen'].value).toBe(expected);
    }
  });

  it('preserves the PBR texture shader and distinguishes its configuration', () => {
    const { material, shader, compile } = setup();
    compile();
    expect(shader.fragmentShader).toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');
    expect(material.customProgramCacheKey()).toContain(JSON.stringify(DEFAULT_CHARACTER_CONFIG.mouth));
  });

  it('rejects incompatible shaders instead of silently omitting the mouth', () => {
    const { shader, compile } = setup();
    shader.vertexShader = 'void main() {}';
    expect(compile).toThrow('The material does not support the mouth shader.');
  });
});