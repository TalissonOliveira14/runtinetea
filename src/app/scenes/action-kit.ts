import * as THREE from 'three';
import type { AudioService } from '../core/audio.service';
import type { Fx } from './fx';

/** Ajustes de pose aplicados ao personagem por cima da animação */
export interface Pose { y: number; lean: number; sway: number; stretch: number; lie: number }

export type ForcedAnim = 'idle' | 'walk' | 'run' | 'sit' | 'angry';

/** Controle temporário de um bichinho (ex.: o cachorro buscando a bola) */
export interface PetHandle {
  root: THREE.Group;
  set(moving: boolean, fast?: boolean): void;
  release(): void;
}

export interface ActionCtx {
  props: Record<string, THREE.Object3D>;
  root: THREE.Group;
  room: THREE.Group;
  H: number; // altura do personagem
  stand: THREE.Vector3; // onde ele fica
  faceYaw: number;
  fx: Fx;
  audio: AudioService;
  pose: Pose;
  time: number;
  /** a ação marca true quando o personagem está andando (toca a animação de andar) */
  moving: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  /** força uma animação específica (ex.: 'sit' para sentar) */
  setAnim(anim?: ForcedAnim): void;
  /** ponto no espaço do personagem (múltiplos da altura) convertido para o mundo */
  at(fx: number, fy: number, fz: number): THREE.Vector3;
  held(): THREE.Object3D | undefined;
  hold(o: THREE.Object3D): void;
  release(): THREE.Object3D | undefined;
  discard(): void;
  recolorTop(hex: number): void;
  setVisible(v: boolean): void;
  wearBackpack(o: THREE.Object3D): void;
  unwearBackpack(): THREE.Object3D | undefined;
  /** fala em voz alta (entra na fila) */
  say(text: string): void;
  /** mão esquerda ('l') ou direita ('r') alcança um ponto do mundo. Chamar a cada quadro. */
  reach(side: 'l' | 'r', target: THREE.Vector3 | null, w?: number): void;
  /** vira suavemente o personagem para um ponto do mundo */
  look(x: number, z: number, dt: number): void;
  pet(): PetHandle | undefined;
  /** trava o personagem no lugar (deitado na cadeira, dormindo) */
  lock(v: boolean): void;
  /** luz do cômodo (1 = normal, 0.2 = escuro) */
  setLight(f: number): void;
  once(key: string, fn: () => void): void;
  every(key: string, dt: number, interval: number, fn: () => void): void;
}

export interface Action {
  duration: number;
  ownsMove?: boolean; // a ação controla a posição do personagem
  start?(c: ActionCtx): void;
  update(c: ActionCtx, p: number, dt: number): void;
  end?(c: ActionCtx): void;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const ease = (x: number) => x * x * (3 - 2 * x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const rnd = () => Math.random() - 0.5;
export const WATER = 0x7dd3fc;

/** Objeto sai de `from`, faz um arco de altura `h` e chega em `to` (k de 0 a 1) */
export function fly(o: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, k: number, h: number): void {
  o.position.lerpVectors(from, to, k);
  o.position.y += Math.sin(Math.PI * k) * h;
}

export function drop(c: ActionCtx, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, life = 0.5): void {
  c.fx.water.emit(x, y, z, vx, vy, vz, WATER, life);
}

/** Mochila escolar 3D detalhada (+Z = bolso externo, -Z = alças nas costas) */
export function makePack(): THREE.Group {
  const g = new THREE.Group();
  const m = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });

  // corpo principal + topo arredondado
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.66, 0.34), m(0xf97316));
  body.position.y = 0.35;
  const topDome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.34, 20), m(0xf97316));
  topDome.rotation.x = Math.PI / 2;
  topDome.position.y = 0.68;

  // aba superior e fecho
  const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.36, 20, 1, false, 0, Math.PI), m(0xea580c));
  flap.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  flap.position.y = 0.68;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), m(0xfacc15));
  buckle.position.set(0, 0.56, 0.19);

  // bolso frontal com zíper
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.13), m(0xfdba74));
  pocket.position.set(0, 0.24, 0.22);
  const pocketTop = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.13, 16), m(0xfdba74));
  pocketTop.rotation.x = Math.PI / 2;
  pocketTop.position.set(0, 0.41, 0.22);
  const zipLine = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.02), m(0x334155));
  zipLine.position.set(0, 0.39, 0.285);
  const zipPull = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.03), m(0xfacc15));
  zipPull.position.set(0.08, 0.36, 0.295);

  // bolsos laterais
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.22), m(0x0ea5e9));
  sideL.position.set(-0.34, 0.24, 0);
  const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.22), m(0x0ea5e9));
  sideR.position.set(0.34, 0.24, 0);

  // alça superior de mão
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.026, 10, 20, Math.PI), m(0x1e293b));
  handle.position.set(0, 0.98, -0.04);

  g.add(body, topDome, flap, buckle, pocket, pocketTop, zipLine, zipPull, sideL, sideR, handle);

  // duas alças de ombro acolchoadas (-Z)
  for (const sx of [-0.19, 0.19]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.05), m(0x1e293b));
    strap.position.set(sx, 0.46, -0.19);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.04), m(0xfb923c));
    pad.position.set(sx, 0.56, -0.21);
    g.add(strap, pad);
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
