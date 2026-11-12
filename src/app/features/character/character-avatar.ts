import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type * as Three from 'three';
import {
  DEFAULT_CHARACTER_CONFIG,
  type AvatarEmotion,
  type AvatarState,
  type BlinkTarget,
  type CharacterConfig,
  type DriverTarget,
} from './character-config';

const FADE_SECONDS = 0.4;
const MOUTH_BONE_NOD = 0.22;

/** Renders one configured character; state, emotion and mouth level come in as inputs. */
@Component({
  selector: 'ls-character-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #canvas role="img" [attr.aria-label]="label()"></canvas>
    @if (!ready() && !failed()) {
      <div class="loading" aria-live="polite">{{ loadingText() }}</div>
    }
    @if (failed()) {
      <div class="fallback" role="img" [attr.aria-label]="label()">
        <p>{{ label() }}</p>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-width: 0;
      min-height: 0;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
    }
    .loading,
    .fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--ls-muted);
      font-size: 0.82rem;
      text-align: center;
    }
    .fallback p {
      margin: 0;
      color: var(--ls-text);
      font-size: 1.25rem;
    }
  `,
})
export class CharacterAvatar implements AfterViewInit, OnDestroy {
  readonly config = input<CharacterConfig>(DEFAULT_CHARACTER_CONFIG);
  readonly state = input<AvatarState>('idle');
  /** An emotion plays once; set it back to null to allow the same one again. */
  readonly emotion = input<AvatarEmotion | null>(null);
  /** 0..1, how far the mouth is open right now. */
  readonly mouthLevel = input(0);
  readonly label = input('3D character');
  readonly loadingText = input('Loading…');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly failed = signal(false);
  protected readonly ready = signal(false);

  private three: typeof import('three') | null = null;
  private renderer: Three.WebGLRenderer | null = null;
  private scene: Three.Scene | null = null;
  private camera: Three.PerspectiveCamera | null = null;
  private mixer: Three.AnimationMixer | null = null;
  private clips = new Map<string, Three.AnimationClip>();
  private current: Three.AnimationAction | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastFrame = 0;
  private frameId = 0;
  private destroyed = false;
  private mouthBone: Three.Object3D | null = null;
  private mouthBoneBaseX = 0;
  private mouthMorphs: { mesh: Three.Mesh; index: number }[] = [];
  private mouthShaderUniforms: { value: number }[] = [];
  private blinkShaderUniforms: { value: number }[] = [];
  private blinkStartTime: number | null = null;
  private nextBlinkAt = 0;
  private readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    effect(() => this.playState(this.state()));
    effect(() => {
      const emotion = this.emotion();
      if (emotion) this.playEmotion(emotion);
    });
    effect(() => {
      const level = this.mouthLevel();
      if (this.reducedMotion) {
        this.applyMouth(level);
        this.render();
      }
    });
  }

  ngAfterViewInit(): void {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.mixer?.stopAllAction();
    const THREE = this.three;
    if (this.scene && THREE) {
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    }
    this.renderer?.dispose();
  }

  private async initialize(): Promise<void> {
    try {
      this.three = await import('three');
      if (this.destroyed) return;
      await this.createScene();
      if (this.destroyed) return;
      this.ready.set(true);
      this.observeSize();
      this.lastFrame = performance.now();
      this.playState(this.state());
      if (this.reducedMotion) {
        this.mixer?.update(0);
        this.applyMouth(this.mouthLevel());
        this.render();
      } else {
        this.frameId = requestAnimationFrame(this.animate);
      }
    } catch {
      if (!this.destroyed) this.failed.set(true);
    }
  }

  private async createScene(): Promise<void> {
    const THREE = this.three;
    if (!THREE) return;
    const canvas = this.canvas().nativeElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    this.camera.position.set(0, 2.05, 9.2);
    this.camera.lookAt(0, 1.85, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene.add(new THREE.HemisphereLight(0xd8efff, 0x253650, 2.1));
    const key = new THREE.DirectionalLight(0xfff5e8, 3.2);
    key.position.set(-3.5, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x63c7f5, 2.2);
    fill.position.set(4, 3, 2);
    this.scene.add(fill);
    const back = new THREE.PointLight(0x2da4dc, 18, 10);
    back.position.set(0, 3.5, -2.5);
    this.scene.add(back);

    await this.loadModel(this.config());
    this.addStage();
    this.nextBlinkAt = performance.now() + 2200 + Math.random() * 2600;
    this.resize();
    this.render();
  }

  private async loadModel(config: CharacterConfig): Promise<void> {
    const THREE = this.three;
    if (!THREE || !this.scene) return;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(config.modelUrl);
    if (this.destroyed) return;

    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    if (largest === 0) throw new Error('The model has no visible geometry.');

    const scale = config.size / largest;
    model.scale.multiplyScalar(scale);
    model.position.set(-center.x * scale, 0.12 - bounds.min.y * scale, -center.z * scale);

    const group = new THREE.Group();
    group.add(model);
    this.scene.add(group);

    this.mixer = new THREE.AnimationMixer(model);
    this.clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    this.bindMouth(model, config);
  }

  private bindMouth(model: Three.Object3D, config: CharacterConfig): void {
    const THREE = this.three;
    if (!THREE) return;
    const target = config.mouth;
    if (target.kind === 'bone') {
      this.mouthBone = model.getObjectByName(target.name) ?? null;
      this.mouthBoneBaseX = this.mouthBone?.rotation.x ?? 0;
    } else if (target.kind === 'morph') {
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const index = object.morphTargetDictionary?.[target.name];
        if (index !== undefined) this.mouthMorphs.push({ mesh: object, index });
      });
    } else if (target.kind === 'shader') {
      this.bindShaderMouth(model, target, config.blink);
    }
  }

  private bindShaderMouth(
    model: Three.Object3D,
    target: Extract<DriverTarget, { kind: 'shader' }>,
    blink: BlinkTarget,
  ): void {
    const THREE = this.three;
    if (!THREE) return;
    const uniformName = `u_${target.parameter.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const blinkUniformName = blink.kind === 'shader'
      ? `u_${blink.parameter.replace(/[^a-zA-Z0-9_]/g, '_')}`
      : '';
    const [centerX, centerY, centerZ] = target.center;
    const axisVector = (axis: 'x' | 'y' | 'z'): string =>
      axis === 'x' ? '1.0, 0.0, 0.0' : axis === 'y' ? '0.0, 1.0, 0.0' : '0.0, 0.0, 1.0';

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const uniform = { value: 0 };
        const blinkUniform = { value: 0 };
        const previousCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previousCompile.call(material, shader, renderer);
          if (
            !shader.vertexShader.includes('#include <begin_vertex>') ||
            !shader.vertexShader.includes('#include <common>') ||
            !shader.fragmentShader.includes('#include <common>') ||
            !shader.fragmentShader.includes('#include <color_fragment>')
          ) throw new Error('The material does not support the mouth shader.');

          shader.uniforms[uniformName] = uniform;
          if (blink.kind === 'shader') shader.uniforms[blinkUniformName] = blinkUniform;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vMouthLocalPosition;',
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvMouthLocalPosition = position;',
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>\nvarying vec3 vMouthLocalPosition;\nuniform float ${uniformName};${blink.kind === 'shader' ? `\nuniform float ${blinkUniformName};` : ''}`,
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec3 mouthDelta = vMouthLocalPosition - vec3(${centerX}, ${centerY}, ${centerZ});
            float mouthHeight = mix(${target.closedHeight}, ${target.openHeight}, clamp(${uniformName}, 0.0, 1.0));
            float mouthHorizontal = dot(mouthDelta, vec3(${axisVector(target.horizontalAxis)}));
            float mouthVertical = dot(mouthDelta, vec3(${axisVector(target.verticalAxis)}));
            float mouthDepthOffset = dot(mouthDelta, vec3(${axisVector(target.depthAxis)}));
            float mouthEllipse = pow(mouthHorizontal / ${target.width}, 2.0) + pow(mouthVertical / mouthHeight, 2.0);
            float mouthDepth = abs(mouthDepthOffset) / ${target.depth};
            float mouthMask = (1.0 - smoothstep(0.72, 1.0, mouthEllipse)) * (1.0 - smoothstep(0.55, 1.0, mouthDepth));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.02, 0.03), mouthMask);
            float incisorHalfHeight = mouthHeight * 0.17;
            float incisorVertical = pow((mouthVertical - mouthHeight * 0.5) / incisorHalfHeight, 2.0);
            float leftIncisor = pow((mouthHorizontal + 0.0085) / 0.007, 2.0) + incisorVertical;
            float rightIncisor = pow((mouthHorizontal - 0.0085) / 0.007, 2.0) + incisorVertical;
            float upperIncisors = max(1.0 - smoothstep(0.72, 1.0, leftIncisor), 1.0 - smoothstep(0.72, 1.0, rightIncisor));
            float lowerIncisor = pow(mouthHorizontal / 0.006, 2.0) + pow((mouthVertical + mouthHeight * 0.48) / (mouthHeight * 0.14), 2.0);
            float teeth = max(upperIncisors, 1.0 - smoothstep(0.72, 1.0, lowerIncisor));
            float teethVisibility = smoothstep(0.2, 0.55, clamp(${uniformName}, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), teeth * mouthMask * teethVisibility);
            ${blink.kind === 'shader' ? `
            float blinkAmount = clamp(${blinkUniformName}, 0.0, 1.0);
            vec3 leftEyeDelta = vMouthLocalPosition - vec3(${blink.leftCenter.join(', ')});
            vec3 rightEyeDelta = vMouthLocalPosition - vec3(${blink.rightCenter.join(', ')});
            float leftEyeHorizontal = dot(leftEyeDelta, vec3(${axisVector('x')}));
            float rightEyeHorizontal = dot(rightEyeDelta, vec3(${axisVector('x')}));
            float leftEyeVertical = dot(leftEyeDelta, vec3(${axisVector('y')}));
            float rightEyeVertical = dot(rightEyeDelta, vec3(${axisVector('y')}));
            float leftEyeDepth = abs(dot(leftEyeDelta, vec3(${axisVector('z')}))) / ${blink.depth};
            float rightEyeDepth = abs(dot(rightEyeDelta, vec3(${axisVector('z')}))) / ${blink.depth};
            float leftEyeShape = pow(leftEyeHorizontal / ${blink.halfWidth}, 2.0) + pow(leftEyeVertical / ${blink.halfHeight}, 2.0);
            float rightEyeShape = pow(rightEyeHorizontal / ${blink.halfWidth}, 2.0) + pow(rightEyeVertical / ${blink.halfHeight}, 2.0);
            float leftEyeMask = (1.0 - smoothstep(0.72, 1.0, leftEyeShape)) * (1.0 - smoothstep(0.55, 1.0, leftEyeDepth));
            float rightEyeMask = (1.0 - smoothstep(0.72, 1.0, rightEyeShape)) * (1.0 - smoothstep(0.55, 1.0, rightEyeDepth));
            float lidEdge = mix(${blink.halfHeight}, -${blink.halfHeight}, blinkAmount);
            float leftLid = smoothstep(lidEdge - 0.002, lidEdge + 0.002, leftEyeVertical) * leftEyeMask * blinkAmount;
            float rightLid = smoothstep(lidEdge - 0.002, lidEdge + 0.002, rightEyeVertical) * rightEyeMask * blinkAmount;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${blink.lidColor.join(', ')}), max(leftLid, rightLid));
            float leftCrease = (1.0 - smoothstep(0.0015, 0.004, abs(leftEyeVertical))) * leftEyeMask * blinkAmount;
            float rightCrease = (1.0 - smoothstep(0.0015, 0.004, abs(rightEyeVertical))) * rightEyeMask * blinkAmount;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${blink.creaseColor.join(', ')}), max(leftCrease, rightCrease));
            ` : ''}`,
          );
        };
        const previousCacheKey = material.customProgramCacheKey.bind(material);
        const shaderConfigKey = JSON.stringify({ mouth: target, blink });
        material.customProgramCacheKey = () => `${previousCacheKey()}|${uniformName}|${blinkUniformName}|${shaderConfigKey}`;
        material.needsUpdate = true;
        this.mouthShaderUniforms.push(uniform);
        if (blink.kind === 'shader') this.blinkShaderUniforms.push(blinkUniform);
      }
    });
  }

  private playState(state: AvatarState): void {
    const config = this.config();
    this.crossFadeTo(config.states[state] ?? config.states.idle, true);
  }

  private playEmotion(emotion: AvatarEmotion): void {
    this.crossFadeTo(this.config().emotions[emotion], false);
  }

  private crossFadeTo(clipName: string | undefined, loop: boolean): void {
    const THREE = this.three;
    const clip = clipName ? this.clips.get(clipName) : undefined;
    if (!THREE || !this.mixer || !clip) return;
    const next = this.mixer.clipAction(clip);
    if (next === this.current) return;

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(FADE_SECONDS).play();
    this.current?.fadeOut(FADE_SECONDS);
    this.current = next;

    if (!loop) {
      const mixer = this.mixer;
      const onFinished = (event: { action: Three.AnimationAction }) => {
        if (event.action !== next) return;
        mixer.removeEventListener('finished', onFinished);
        this.current = null;
        this.playState(this.state());
      };
      mixer.addEventListener('finished', onFinished);
    }
  }

  private addStage(): void {
    const THREE = this.three;
    if (!THREE || !this.scene) return;
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.94, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x1e3047, roughness: 0.62 }),
    );
    platform.position.y = 0.04;
    this.scene.add(platform);
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.025, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x2da4dc, metalness: 0.28, roughness: 0.42 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.12;
    this.scene.add(trim);
  }

  private observeSize(): void {
    const host = this.canvas().nativeElement.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.render();
    });
    this.resizeObserver.observe(host);
  }

  private resize(): void {
    const host = this.canvas().nativeElement.parentElement;
    if (!host || !this.camera || !this.renderer) return;
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private readonly animate = (): void => {
    const now = performance.now();
    this.mixer?.update((now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.applyMouth(this.mouthLevel());
    this.updateBlink(now);
    this.render();
    this.frameId = requestAnimationFrame(this.animate);
  };

  private updateBlink(now: number): void {
    if (this.reducedMotion || this.blinkShaderUniforms.length === 0) return;
    if (this.blinkStartTime === null) {
      if (now < this.nextBlinkAt) return;
      this.blinkStartTime = now;
    }

    const progress = Math.min(1, (now - this.blinkStartTime) / 180);
    const phase = progress < 0.45 ? progress / 0.45 : (progress - 0.45) / 0.55;
    const eased = phase * phase * (3 - 2 * phase);
    const amount = progress < 0.45 ? eased : 1 - eased;
    this.applyBlink(amount);

    if (progress === 1) {
      this.blinkStartTime = null;
      this.nextBlinkAt = now + 2200 + Math.random() * 3000;
    }
  }

  private applyBlink(level: number): void {
    const closed = Math.min(1, Math.max(0, level));
    for (const uniform of this.blinkShaderUniforms) uniform.value = closed;
  }

  /** Runs after the mixer, which would otherwise overwrite a bone pose every frame. */
  private applyMouth(level: number): void {
    const open = Math.min(1, Math.max(0, level));
    for (const { mesh, index } of this.mouthMorphs) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = open;
    }
    if (this.mouthBone) this.mouthBone.rotation.x = this.mouthBoneBaseX + open * MOUTH_BONE_NOD;
    for (const uniform of this.mouthShaderUniforms) uniform.value = open;
  }

  private render(): void {
    if (this.scene && this.camera && this.renderer) this.renderer.render(this.scene, this.camera);
  }
}
