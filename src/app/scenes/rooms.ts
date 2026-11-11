import * as THREE from 'three';
import { emojiSprite } from './fx';
import { ClothBlanket } from './cloth';

export const ROOM_W = 14; // x: -7 .. 7
export const ROOM_D = 10; // z: -5 .. 5 (parede de fundo em z = -5, frente aberta para a câmera)

export type Collider = [number, number, number, number]; // minX, maxX, minZ, maxZ

export type ActionId =
  | 'wake' | 'makeBed' | 'dress' | 'backpack'
  | 'toilet' | 'washHands' | 'brush' | 'shower'
  | 'fruit' | 'eat' | 'dishes' | 'cabinet'
  | 'closeDoor' | 'lookBoth' | 'waitBus' | 'boardBus'
  | 'storePack' | 'draw' | 'raiseHand' | 'lunch'
  | 'fetch' | 'pet' | 'sandcastle' | 'slide'
  | 'toys' | 'shoes' | 'plant' | 'book'
  | 'pickBread' | 'pickMilk' | 'pickFruit' | 'pay'
  | 'sitChair' | 'openMouth' | 'rinse' | 'sticker'
  | 'lightsOff' | 'sleep';

export interface StepDef {
  label: string;
  icon: string;
  say: string; // o que a voz fala ({nome} vira o nome da criança)
  x: number; // onde o personagem fica para fazer a ação
  z: number;
  look: [number, number]; // para onde ele olha
  action: ActionId;
  trigger?: 'move'; // começa ao mexer no joystick (ex.: acordar)
  auto?: boolean; // começa sozinha, pouco depois de virar a etapa atual
}

export interface RoomDef {
  id: string;
  name: string;
  icon: string;
  intro: string; // fala ao chegar no cômodo
  sky: number; // cor do céu
  floor: number;
  tile?: number;
  wall: number;
  outdoor?: boolean; // sem paredes
  w?: number; // largura/profundidade (padrão ROOM_W x ROOM_D)
  d?: number;
  spawn?: [number, number];
  cam?: [number, number]; // altura e distância da câmera
  sleepStart?: boolean; // o personagem começa deitado na cama
  world: number;
  story: { icon: string; text: string }[]; // história social lida antes da fase
  free?: boolean; // etapas independentes: a criança pode escolher a ordem
  night?: boolean; // luz fraca
  steps: StepDef[];
  furnish: (b: Builder) => void;
}

export const WORLDS = [
  { id: 1, name: 'Manhã em casa', icon: '🌅' },
  { id: 2, name: 'Caminho da escola', icon: '🚌' },
  { id: 3, name: 'Tarde e noite', icon: '🌙' },
  { id: 4, name: 'Aventuras', icon: '🛒' },
];

// ------------------------------------------------------------------ helper de construção

export class Builder {
  group = new THREE.Group();
  colliders: Collider[] = [];
  props: Record<string, THREE.Object3D> = {};
  private mats = new Map<number, THREE.MeshStandardMaterial>();

  private mat(color: number): THREE.MeshStandardMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
      this.mats.set(color, m);
    }
    return m;
  }

  private place(mesh: THREE.Mesh, parent: THREE.Object3D): THREE.Mesh {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** y = altura da base do objeto. Com `parent`, as coordenadas são relativas a ele. */
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, collide = false, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    mesh.position.set(x, y + h / 2, z);
    if (collide) this.col(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return this.place(mesh, parent);
  }

  cyl(r: number, h: number, color: number, x: number, y: number, z: number, collide = false, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), this.mat(color));
    mesh.position.set(x, y + h / 2, z);
    if (collide) this.col(x - r, x + r, z - r, z + r);
    return this.place(mesh, parent);
  }

  /** y = centro da esfera */
  sph(r: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.mat(color));
    mesh.position.set(x, y, z);
    return this.place(mesh, parent);
  }

  /** Grupo com nome, para as ações animarem (portas, objetos que voam...) */
  pivot(name: string, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.group.add(g);
    this.props[name] = g;
    return g;
  }

  col(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.colliders.push([minX, maxX, minZ, maxZ]);
  }
}

function checker(c1: number, c2: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
  g.fillStyle = hex(c1);
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = hex(c2);
  g.fillRect(0, 0, 32, 32);
  g.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM_W / 2, ROOM_D / 2);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(def: RoomDef): { group: THREE.Group; colliders: Collider[]; props: Record<string, THREE.Object3D> } {
  const b = new Builder();
  const W = def.w ?? ROOM_W;
  const D = def.d ?? ROOM_D;

  const floorMat = new THREE.MeshStandardMaterial({
    color: def.tile ? 0xffffff : def.floor,
    map: def.tile && !def.outdoor ? checker(def.floor, def.tile) : null,
    roughness: def.outdoor ? 1 : 0.5,
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), floorMat);
  floor.position.set(0, -0.15, 0);
  floor.receiveShadow = true;
  b.group.add(floor);

  if (!def.outdoor) {
    b.box(W + 0.6, 5, 0.3, def.wall, 0, 0, -D / 2 - 0.15);
    b.box(0.3, 5, D + 0.3, def.wall, -W / 2 - 0.15, 0, 0);
    b.box(0.3, 5, D + 0.3, def.wall, W / 2 + 0.15, 0, 0);
  }

  def.furnish(b);
  return { group: b.group, colliders: b.colliders, props: b.props };
}

// ------------------------------------------------------------------ cômodos

/** Quarto completo (usado de manhã e à noite) */
function bedroom(b: Builder, night: boolean): void {
      // cama
      b.box(2.4, 0.5, 3.6, 0x92400e, -4.6, 0, -3, true);
      b.box(2.2, 0.3, 3.4, 0xf8fafc, -4.6, 0.5, -3);
      b.box(2.4, 1.4, 0.2, 0x78350f, -4.6, 0, -4.8);
      const pillow = b.pivot('pillow', -4.6, 0.925, -4.15);
      b.box(1.6, 0.25, 0.8, 0xffffff, 0, -0.125, 0, false, pillow);

      // coberta de pano: começa cobrindo a criança
      const bl = b.pivot('blanket', -4.6, 0.8, -2.5);
      const cloth = new ClothBlanket();
      if (night) {
        // cama já arrumada, esperando a criança deitar
        cloth.params.raise = 0;
        cloth.params.wrinkle = 0.03;
        cloth.params.smoothL = cloth.params.smoothR = 1.2;
        cloth.params.fold = Math.PI;
      } else {
        cloth.params.raise = 0.45; // cobrindo a criança dormindo
        cloth.params.wrinkle = 0.035;
        cloth.params.smoothL = cloth.params.smoothR = 1.2;
      }
      cloth.update();
      bl.add(cloth.mesh);
      bl.userData['cloth'] = cloth;

      // ursinho no chão (a criança coloca no travesseiro no fim)
      const teddy = b.pivot('teddy', night ? -4.6 : -6.4, night ? 1.05 : 0, night ? -4.15 : -4.0);
      b.sph(0.22, 0xb45309, 0, 0.25, 0, teddy);
      b.sph(0.16, 0xb45309, 0, 0.56, 0, teddy);
      b.sph(0.06, 0xb45309, -0.12, 0.7, 0, teddy);
      b.sph(0.06, 0xb45309, 0.12, 0.7, 0, teddy);
      b.sph(0.07, 0xfcd34d, 0, 0.53, 0.14, teddy);
      b.sph(0.025, 0x1f2937, -0.06, 0.6, 0.13, teddy);
      b.sph(0.025, 0x1f2937, 0.06, 0.6, 0.13, teddy);

      // "Zzz" sobre a cama
      const zzz = emojiSprite('💤', 1.2);
      zzz.position.set(-4.6, 2.6, -3.6);
      zzz.visible = !night;
      b.group.add(zzz);
      b.props['zzz'] = zzz;

      // guarda-roupa com portas que abrem
      b.box(3, 4, 1.2, 0x7c3aed, 3.5, 0, -4.2, true);
      b.box(2.8, 3.6, 0.04, 0x2e1065, 3.5, 0.2, -3.61);
      [[2.7, 0xf87171], [3.3, 0x34d399], [3.9, 0xfacc15], [4.4, 0x60a5fa]].forEach(([x, c]) => b.box(0.4, 0.8, 0.08, c, x, 2.2, -3.55));
      const wl = b.pivot('wardL', 2.1, 0.2, -3.55);
      b.box(1.4, 3.6, 0.06, 0x8b5cf6, 0.7, 0, 0, false, wl);
      b.box(0.08, 0.5, 0.06, 0xfacc15, 1.25, 1.5, 0.05, false, wl);
      const wr = b.pivot('wardR', 4.9, 0.2, -3.55);
      b.box(1.4, 3.6, 0.06, 0x8b5cf6, -0.7, 0, 0, false, wr);
      b.box(0.08, 0.5, 0.06, 0xfacc15, -1.25, 1.5, 0.05, false, wr);

      // janela, escrivaninha, tapete
      b.box(2.4, 1.8, 0.05, 0xffffff, 0, 1.6, -4.98);
      b.box(2.1, 1.5, 0.06, 0x7dd3fc, 0, 1.75, -4.96);
      b.box(1.4, 0.9, 2, 0xd97706, 6.3, 0, 0.3, true);
      b.box(0.5, 0.1, 0.7, 0xef4444, 6.3, 0.9, 0.3);
      b.cyl(2.2, 0.04, 0xfda4af, -0.5, 0, 1.2);

      // mochila no chão
      const pack = b.pivot('pack', 5, 0, 2.8);
      b.box(0.7, 0.9, 0.4, 0xf97316, 0, 0, 0, false, pack);
      b.box(0.5, 0.4, 0.1, 0xfdba74, 0, 0.15, 0.23, false, pack);
}

export const ROOMS: RoomDef[] = [
  // ============================================================ QUARTO
  {
    id: 'quarto',
    world: 1,
    story: [{ icon: '⏰', text: 'De manhã eu acordo.' }, { icon: '🛏️', text: 'Eu arrumo a minha cama e troco de roupa.' }, { icon: '🎒', text: 'Depois eu pego a minha mochila.' }],
    name: 'Quarto',
    icon: '🛏️',
    intro: '',
    sky: 0xfde68a,
    floor: 0xd9a066,
    wall: 0xbfdbfe,
    sleepStart: true,
    steps: [
      { label: 'Levantar da cama', icon: '🛏️', say: 'Bom dia, {nome}! Hora de acordar. Mexa o joystick para levantar da cama.', x: -2.6, z: -2.4, look: [-4.6, -3], action: 'wake', trigger: 'move' },
      { label: 'Arrumar a cama', icon: '✨', say: '{nome}, está na hora de arrumar a cama. Pegue o lençol e arrume.', x: -4.6, z: -0.4, look: [-4.6, -2.5], action: 'makeBed' },
      { label: 'Trocar de roupa', icon: '👕', say: 'Agora, troque de roupa. Vá até o guarda-roupa.', x: 3.5, z: -2.6, look: [3.5, -4.2], action: 'dress' },
      { label: 'Pegar a mochila', icon: '🎒', say: 'Pegue a sua mochila para ir à escola.', x: 5, z: 2.1, look: [5, 2.8], action: 'backpack' },
    ],
    furnish: (b) => bedroom(b, false),
  },

  // ============================================================ BANHEIRO
  {
    id: 'banheiro',
    world: 1,
    story: [{ icon: '🚽', text: 'Eu uso o vaso e lavo as mãos.' }, { icon: '🪥', text: 'Eu escovo os dentes.' }, { icon: '🚿', text: 'Eu tomo banho. A água é gostosa.' }],
    name: 'Banheiro',
    icon: '🛁',
    intro: 'Agora vamos para o banheiro.',
    sky: 0x87ceeb,
    floor: 0xe0f2fe,
    tile: 0xbae6fd,
    wall: 0xa7f3d0,
    steps: [
      { label: 'Usar o vaso', icon: '🚽', say: '{nome}, use o vaso sanitário.', x: 4.6, z: -2.5, look: [4.6, -3.8], action: 'toilet' },
      { label: 'Lavar as mãos', icon: '🧼', say: 'Agora, lave as mãos com água e sabonete.', x: -0.9, z: -2.7, look: [-0.9, -4.3], action: 'washHands' },
      { label: 'Escovar os dentes', icon: '🪥', say: 'Hora de escovar os dentes. Vá até a outra pia.', x: 0.9, z: -2.7, look: [0.9, -4.3], action: 'brush' },
      { label: 'Tomar banho', icon: '🚿', say: 'Hora do banho! Fique debaixo do chuveiro.', x: -5, z: -4.1, look: [-5, 10], action: 'shower' },
    ],
    furnish: (b) => {
      // chuveiro
      b.box(3, 0.04, 3, 0x93c5fd, -5, 0, -3.4);
      b.box(0.1, 3.4, 0.1, 0x94a3b8, -5, 0, -4.75);
      b.box(0.1, 0.1, 0.7, 0x94a3b8, -5, 3.3, -4.4);
      b.cyl(0.35, 0.1, 0x64748b, -5, 3.2, -4.1);
      b.box(0.08, 3, 3, 0xa5f3fc, -3.45, 0.2, -3.4, true);

      // bancada com duas pias e espelho
      b.box(3.8, 1, 1, 0xe2e8f0, 0, 0, -4.3, true);
      for (const x of [-0.9, 0.9]) {
        b.cyl(0.5, 0.1, 0x38bdf8, x, 1, -4.3);
        b.box(0.1, 0.45, 0.1, 0x94a3b8, x, 1.0, -4.65);
        b.box(0.08, 0.08, 0.35, 0x94a3b8, x, 1.4, -4.5);
      }
      b.box(3.4, 1.5, 0.05, 0x64748b, 0, 1.75, -4.98);
      b.box(3.2, 1.3, 0.06, 0xbae6fd, 0, 1.85, -4.96);
      b.cyl(0.1, 0.25, 0xf472b6, 1.6, 1.0, -4.3);
      b.box(0.25, 0.12, 0.18, 0xfde047, -1.6, 1.0, -4.3);

      // vaso + biombo de privacidade
      b.cyl(0.4, 0.7, 0xffffff, 4.6, 0, -3.8, true);
      b.box(0.9, 0.9, 0.4, 0xffffff, 4.6, 0.7, -4.5, true);
      const pv = b.pivot('privacy', 4.6, 0, -1.9);
      b.box(2.2, 2.4, 0.1, 0xf9a8d4, 0, 0, 0, false, pv);
      b.box(2.2, 0.1, 0.12, 0xec4899, 0, 2.3, 0, false, pv);
      pv.scale.y = 0.001;
      pv.visible = false;

      b.box(0.9, 1.2, 1.6, 0x14b8a6, 6.5, 0, 0.5, true);
      b.box(1.4, 0.04, 0.9, 0xfb7185, -1.5, 0, 0.5);
    },
  },

  // ============================================================ COZINHA
  {
    id: 'cozinha',
    world: 1,
    story: [{ icon: '🍎', text: 'Eu pego uma fruta.' }, { icon: '🍽️', text: 'Eu como à mesa, com calma.' }, { icon: '🧽', text: 'Depois eu lavo e guardo o prato.' }],
    name: 'Cozinha',
    icon: '🍳',
    intro: 'Agora vamos para a cozinha.',
    sky: 0x87ceeb,
    floor: 0xfef3c7,
    tile: 0xfde68a,
    wall: 0xfecaca,
    steps: [
      { label: 'Pegar uma fruta', icon: '🍎', say: '{nome}, pegue uma fruta na geladeira.', x: -5.5, z: -2.6, look: [-5.5, -4.1], action: 'fruit' },
      { label: 'Comer à mesa', icon: '🍽️', say: 'Vá até a mesa e coma a sua fruta.', x: 1.5, z: 1.0, look: [1.5, -0.5], action: 'eat' },
      { label: 'Lavar o prato', icon: '🧽', say: 'Leve o prato até a pia e lave.', x: 3.5, z: -2.6, look: [3.5, -4.1], action: 'dishes' },
      { label: 'Guardar no armário', icon: '🗄️', say: 'Agora, guarde o prato no armário.', x: 5.3, z: 1.5, look: [6.4, 1.5], action: 'cabinet' },
    ],
    furnish: (b) => {
      // geladeira
      b.box(1.6, 3.2, 1.4, 0xf1f5f9, -5.5, 0, -4.1, true);
      b.box(1.4, 2.9, 0.04, 0xdbeafe, -5.5, 0.15, -3.41);
      b.box(1.4, 0.05, 0.5, 0x93c5fd, -5.5, 1.2, -3.62);
      b.box(1.4, 0.05, 0.5, 0x93c5fd, -5.5, 2.0, -3.62);
      b.box(0.25, 0.5, 0.25, 0xffffff, -6.0, 1.25, -3.65);
      b.sph(0.13, 0xfb923c, -5.75, 1.38, -3.65);
      const apple = b.pivot('apple', -5.2, 1.25, -3.6);
      b.sph(0.14, 0xef4444, 0, 0.14, 0, apple);
      b.box(0.03, 0.08, 0.03, 0x78350f, 0, 0.27, 0, false, apple);
      b.box(0.1, 0.02, 0.06, 0x22c55e, 0.05, 0.3, 0, false, apple);
      const fd = b.pivot('fridgeDoor', -4.7, 0.1, -3.36);
      b.box(1.6, 3.0, 0.1, 0xe2e8f0, -0.8, 0, 0, false, fd);
      b.box(0.08, 1.2, 0.1, 0x64748b, -0.15, 1.0, 0.1, false, fd);

      // mesa, cadeiras e prato
      b.box(2.8, 0.15, 1.8, 0xb45309, 1.5, 0.85, -0.5);
      for (const [lx, lz] of [[0.3, -1.2], [2.7, -1.2], [0.3, 0.2], [2.7, 0.2]]) b.box(0.15, 0.85, 0.15, 0x92400e, lx, 0, lz);
      b.col(0.1, 2.9, -1.4, 0.4);
      for (const cx of [-0.5, 3.5]) {
        b.box(0.6, 0.45, 0.6, 0xef4444, cx, 0, -0.5, true);
        b.box(0.1, 0.6, 0.6, 0xdc2626, cx + (cx < 1 ? -0.25 : 0.25), 0.45, -0.5);
      }
      const plate = b.pivot('plate', 1.5, 1.0, -0.5);
      b.cyl(0.3, 0.04, 0xffffff, 0, 0, 0, false, plate);
      const crumbs = b.box(0.18, 0.04, 0.12, 0xfbbf24, 0.05, 0.04, 0, false, plate);
      crumbs.visible = false;
      plate.userData['crumbs'] = crumbs;

      // balcão com pia e fogão
      b.box(4.4, 1.0, 1.4, 0xfef3c7, 3.5, 0, -4.1, true);
      b.box(4.4, 0.1, 1.4, 0x94a3b8, 3.5, 1.0, -4.1);
      b.cyl(0.5, 0.1, 0x7dd3fc, 3.5, 1.05, -4.1);
      b.box(0.1, 0.35, 0.1, 0x64748b, 3.5, 1.1, -4.55);
      b.box(0.08, 0.08, 0.35, 0x64748b, 3.5, 1.4, -4.4);
      b.cyl(0.3, 0.05, 0x1f2937, 5.0, 1.1, -4.1);
      b.box(3, 1, 0.8, 0xc2410c, 3.5, 2.6, -4.5);

      // armário alto
      b.box(1.2, 3.6, 2, 0xc2410c, 6.4, 0, 1.5, true);
      b.box(0.04, 3.2, 1.8, 0x431407, 5.79, 0.2, 1.5);
      const cl = b.pivot('cabL', 5.78, 0.2, 0.55);
      b.box(0.05, 3.2, 0.9, 0x9a3412, 0, 0, 0.45, false, cl);
      const cr = b.pivot('cabR', 5.78, 0.2, 2.45);
      b.box(0.05, 3.2, 0.9, 0x9a3412, 0, 0, -0.45, false, cr);
      b.box(2.4, 0.04, 1.4, 0x86efac, 1.5, 0, 2.6);
    },
  },

  // ============================================================ RUA (sair de casa e pegar o ônibus)
  {
    id: 'rua',
    world: 2,
    story: [{ icon: '🚪', text: 'Eu saio de casa e fecho a porta.' }, { icon: '👀', text: 'Eu olho para os dois lados da rua.' }, { icon: '🚌', text: 'Eu espero o ônibus no ponto e subo.' }],
    name: 'Rua',
    icon: '🚌',
    intro: 'Agora vamos para a escola. Vamos sair de casa.',
    sky: 0x7dd3fc,
    outdoor: true,
    w: 24,
    d: 12,
    spawn: [-5.4, -2.2],
    cam: [5.2, 7.2],
    floor: 0x86efac,
    wall: 0,
    steps: [
      { label: 'Fechar a porta', icon: '🚪', say: '{nome}, feche a porta de casa.', x: -7.0, z: -2.7, look: [-7, -4.6], action: 'closeDoor' },
      { label: 'Olhar a rua', icon: '👀', say: 'Vá até a beirada da calçada e olhe para os dois lados.', x: 0.5, z: -1.4, look: [0.5, 1.5], action: 'lookBoth' },
      { label: 'Esperar o ônibus', icon: '🚏', say: 'Agora, espere o ônibus no ponto.', x: 5.0, z: -2.3, look: [5, 1.4], action: 'waitBus' },
      { label: 'Subir no ônibus', icon: '🚌', say: 'O ônibus chegou! Suba no ônibus.', x: 5.3, z: -1.0, look: [5.3, 1.4], action: 'boardBus' },
    ],
    furnish: (b) => {
      // calçada, rua (bloqueada: criança não entra na rua) e meio-fio
      b.box(24, 0.06, 2.4, 0xe2e8f0, 0, 0, -2.2);
      b.box(24, 0.04, 4.4, 0x475569, 0, 0, 1.2);
      for (let x = -11; x <= 11; x += 2.2) b.box(1.2, 0.02, 0.15, 0xfef08a, x, 0.04, 1.2);
      b.box(24, 0.1, 0.15, 0xcbd5e1, 0, 0, -1.0);
      b.col(-12, 12, -0.9, 6);

      // casa com porta
      b.box(7, 3.6, 1.2, 0xfde68a, -7, 0, -5.2, true);
      b.box(7.6, 0.5, 1.8, 0xdc2626, -7, 3.6, -5.1);
      b.box(1.1, 2.2, 0.04, 0x1e1b4b, -7, 0, -4.59);
      const door = b.pivot('houseDoor', -7.55, 0, -4.55);
      b.box(1.1, 2.2, 0.08, 0x7c2d12, 0.55, 0, 0, false, door);
      b.box(0.1, 0.1, 0.1, 0xfacc15, 0.95, 1.1, 0.08, false, door);
      door.rotation.y = -1.5; // começa aberta
      b.box(1.1, 1.0, 0.05, 0x7dd3fc, -9.3, 1.4, -4.58);
      b.box(1.1, 1.0, 0.05, 0x7dd3fc, -4.7, 1.4, -4.58);

      // árvores
      for (const [tx, tz] of [[-11, -2], [1.5, -5], [9.5, -4.5], [-2, -5]]) {
        b.cyl(0.25, 1.6, 0x78350f, tx, 0, tz, true);
        b.sph(1.0, 0x22c55e, tx, 2.2, tz);
        b.sph(0.7, 0x16a34a, tx + 0.5, 2.7, tz);
      }

      // ponto de ônibus
      b.cyl(0.07, 3, 0x64748b, 6.4, 0, -2.9, true);
      b.box(0.9, 0.9, 0.06, 0xfacc15, 6.4, 2.2, -2.9);
      const bs = emojiSprite('🚌', 0.7);
      bs.position.set(6.4, 2.65, -2.84);
      b.group.add(bs);
      b.box(1.8, 0.1, 0.5, 0x92400e, 3.6, 0.5, -2.9, true);
      b.box(0.1, 0.5, 0.4, 0x64748b, 2.9, 0, -2.9);
      b.box(0.1, 0.5, 0.4, 0x64748b, 4.3, 0, -2.9);

      // ônibus (chega de longe pela direita)
      const bus = b.pivot('bus', 32, 0, 1.4);
      b.box(7, 2.0, 2.6, 0xfacc15, 0, 0.5, 0, false, bus);
      b.box(7.02, 0.25, 2.62, 0x1f2937, 0, 1.0, 0, false, bus);
      for (const wx of [-2.4, -1.2, 0, 1.2, 2.4]) {
        b.box(0.9, 0.7, 0.05, 0x7dd3fc, wx, 1.6, 1.32, false, bus);
        b.box(0.9, 0.7, 0.05, 0x7dd3fc, wx, 1.6, -1.32, false, bus);
      }
      b.box(0.05, 0.8, 2.2, 0x7dd3fc, -3.52, 1.6, 0, false, bus);
      const wheels: THREE.Mesh[] = [];
      for (const wx of [-2.2, 2.2]) {
        for (const wz of [-1.3, 1.3]) {
          const w = b.cyl(0.45, 0.3, 0x111827, wx, 0.3, wz, false, bus);
          w.rotation.x = Math.PI / 2;
          wheels.push(w);
        }
      }
      bus.userData['wheels'] = wheels;
      const roof = emojiSprite('🏫', 1.1);
      roof.position.set(0, 3.1, 0);
      bus.add(roof);
      b.box(0.9, 1.7, 0.04, 0x0f172a, -2.2, 0.55, -1.31, false, bus);
      const dp = new THREE.Group();
      dp.position.set(-2.65, 0.55, -1.34);
      b.box(0.9, 1.7, 0.06, 0x0ea5e9, 0.45, 0, 0, false, dp);
      bus.add(dp);
      b.props['busDoor'] = dp;

      // carro que passa na hora de olhar a rua
      const car = b.pivot('car', 40, 0, 2.6);
      b.box(3, 0.7, 1.5, 0xef4444, 0, 0.35, 0, false, car);
      b.box(1.6, 0.6, 1.4, 0xfca5a5, 0, 1.0, 0, false, car);
      for (const wx of [-0.9, 0.9]) for (const wz of [-0.7, 0.7]) b.cyl(0.28, 0.2, 0x111827, wx, 0.1, wz, false, car).rotation.x = Math.PI / 2;
    },
  },

  // ============================================================ ESCOLA
  {
    id: 'escola',
    free: true,
    world: 2,
    story: [{ icon: '🏫', text: 'Na escola eu guardo a mochila.' }, { icon: '🙋', text: 'Quando quero falar, eu levanto a mão.' }, { icon: '🥪', text: 'No lanche eu como com calma.' }],
    name: 'Escola',
    icon: '🏫',
    intro: 'Chegamos na escola!',
    sky: 0x93c5fd,
    floor: 0xe7c9a9,
    wall: 0xfef3c7,
    steps: [
      { label: 'Guardar a mochila', icon: '🎒', say: '{nome}, guarde a mochila no armário.', x: -4.9, z: -1.5, look: [-6.4, -1.5], action: 'storePack' },
      { label: 'Desenhar', icon: '🖍️', say: 'Vá até a sua carteira e desenhe no caderno.', x: -1.0, z: 1.7, look: [-1, 0.8], action: 'draw' },
      { label: 'Falar com a professora', icon: '🙋', say: 'Vá para a rodinha e levante a mão para falar com a professora.', x: 1.0, z: 2.0, look: [2.6, -3.4], action: 'raiseHand' },
      { label: 'Hora do lanche', icon: '🥪', say: 'Hora do lanche! Sente na carteira e coma.', x: 3.0, z: 1.7, look: [3, 0.8], action: 'lunch' },
    ],
    furnish: (b) => {
      // quadro
      b.box(5.3, 2.5, 0.06, 0x92400e, 0, 1.05, -4.98);
      b.box(5, 2.2, 0.06, 0x14532d, 0, 1.2, -4.94);
      const abc = emojiSprite('🔤', 1.0);
      abc.position.set(-1.3, 2.4, -4.85);
      const sum = emojiSprite('➕', 1.0);
      sum.position.set(1.3, 2.4, -4.85);
      b.group.add(abc, sum);

      // professora (estilo bonequinho) + mesa
      b.box(1.8, 0.9, 0.9, 0xb45309, 4.2, 0, -4.2, true);
      const t = b.pivot('teacher', 2.6, 0, -3.4);
      t.rotation.y = Math.PI;
      b.box(0.6, 0.9, 0.35, 0xa855f7, 0, 0.75, 0, false, t);
      b.box(0.26, 0.75, 0.3, 0x1e3a8a, -0.16, 0, 0, false, t);
      b.box(0.26, 0.75, 0.3, 0x1e3a8a, 0.16, 0, 0, false, t);
      b.box(0.18, 0.8, 0.22, 0xfcd9b6, -0.4, 0.8, 0, false, t);
      b.box(0.18, 0.8, 0.22, 0xfcd9b6, 0.4, 0.8, 0, false, t);
      b.box(0.5, 0.5, 0.5, 0xfcd9b6, 0, 1.65, 0, false, t);
      b.box(0.54, 0.2, 0.54, 0x78350f, 0, 2.05, -0.02, false, t);
      b.box(0.07, 0.07, 0.04, 0x1f2937, -0.12, 1.85, 0.26, false, t);
      b.box(0.07, 0.07, 0.04, 0x1f2937, 0.12, 1.85, 0.26, false, t);

      // armário com nichos (a mochila vai para o do meio)
      b.box(1.0, 2.6, 4.0, 0xf59e0b, -6.4, 0, -1.5, true);
      for (const z of [-2.8, -1.5, -0.2]) b.box(0.04, 2.0, 1.1, 0x451a03, -5.89, 0.3, z);

      // carteiras: caderno (desenho) e lancheira
      for (const dx of [-1.0, 3.0]) {
        b.box(1.6, 0.08, 0.9, 0xfbbf24, dx, 0.75, 0.8);
        for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) b.box(0.08, 0.75, 0.08, 0x92400e, dx + lx, 0, 0.8 + lz);
        b.col(dx - 0.8, dx + 0.8, 0.35, 1.25);
      }
      const nb = b.pivot('notebook', -1.0, 0.83, 0.8);
      b.box(0.7, 0.02, 0.5, 0xffffff, 0, 0, 0, false, nb);
      const sun = b.cyl(0.07, 0.015, 0xfacc15, -0.2, 0.02, -0.1, false, nb);
      const house = b.box(0.16, 0.03, 0.14, 0xef4444, 0.05, 0.02, 0.0, false, nb);
      const tree = b.sph(0.06, 0x22c55e, 0.22, 0.08, 0.05, nb);
      [sun, house, tree].forEach((m) => (m.visible = false));
      nb.userData['pieces'] = [sun, house, tree];

      b.box(0.5, 0.18, 0.32, 0x3b82f6, 3.0, 0.83, 0.8);
      const lid = b.pivot('lunchLid', 3.0, 1.01, 0.64);
      b.box(0.5, 0.04, 0.32, 0x2563eb, 0, 0, 0.16, false, lid);
      const sw = b.pivot('sandwich', 3.0, 0.9, 0.8);
      b.box(0.3, 0.04, 0.28, 0xfcd34d, 0, 0, 0, false, sw);
      b.box(0.3, 0.04, 0.28, 0x22c55e, 0, 0.04, 0, false, sw);
      b.box(0.3, 0.05, 0.28, 0xfcd34d, 0, 0.08, 0, false, sw);

      // rodinha, janela, cartazes
      b.cyl(1.6, 0.03, 0x86efac, 1.0, 0, 2.4);
      b.box(2, 1.5, 0.05, 0x7dd3fc, -4.5, 2.0, -4.98);
      b.box(1.2, 0.9, 0.05, 0xf9a8d4, 5.5, 2.4, -4.98);
    },
  },

  // ============================================================ RECREIO
  {
    id: 'recreio',
    free: true,
    world: 2,
    story: [{ icon: '⚽', text: 'No recreio eu brinco.' }, { icon: '🐶', text: 'Eu faço carinho no cachorrinho.' }, { icon: '🛝', text: 'Eu escorrego e me divirto.' }],
    name: 'Recreio',
    icon: '⚽',
    intro: 'Hora do recreio! O seu cachorrinho veio brincar com você.',
    sky: 0x7dd3fc,
    outdoor: true,
    w: 22,
    d: 12,
    cam: [4.8, 7.2],
    floor: 0x86efac,
    wall: 0,
    steps: [
      { label: 'Brincar de bola', icon: '⚽', say: '{nome}, brinque de bola com o cachorrinho.', x: -1.5, z: 2.0, look: [1, 1.5], action: 'fetch' },
      { label: 'Fazer carinho', icon: '🐶', say: 'Agora, faça carinho no cachorrinho.', x: 0.4, z: 2.7, look: [0.4, 1.7], action: 'pet' },
      { label: 'Castelo de areia', icon: '🏰', say: 'Vá até a caixa de areia e faça um castelo.', x: -6, z: -0.9, look: [-6, -2.0], action: 'sandcastle' },
      { label: 'Escorregar', icon: '🛝', say: 'Agora, suba a escada e escorregue no escorregador.', x: 3.2, z: -4.4, look: [4.0, -4.4], action: 'slide' },
    ],
    furnish: (b) => {
      // caixa de areia + castelo (cresce)
      b.box(4, 0.12, 3, 0xfde68a, -6, 0, -2);
      b.box(4.2, 0.2, 0.12, 0x92400e, -6, 0, -3.5);
      b.box(4.2, 0.2, 0.12, 0x92400e, -6, 0, -0.5);
      b.box(0.12, 0.2, 3, 0x92400e, -8.05, 0, -2);
      b.box(0.12, 0.2, 3, 0x92400e, -3.95, 0, -2);
      const m = b.pivot('mound', -6, 0.12, -2.1);
      b.cyl(0.6, 0.2, 0xf5d98a, 0, 0, 0, false, m);
      b.cyl(0.45, 0.25, 0xf0cf7a, 0, 0.2, 0, false, m);
      b.cyl(0.28, 0.3, 0xe9c46a, 0, 0.45, 0, false, m);
      b.box(0.02, 0.25, 0.02, 0x78350f, 0, 0.75, 0, false, m);
      b.box(0.15, 0.1, 0.02, 0xef4444, 0.08, 0.88, 0, false, m);
      m.scale.setScalar(0.001);

      // escorregador
      for (const [px, pz] of [[4.45, -4.9], [5.55, -4.9], [4.45, -3.9], [5.55, -3.9]]) b.box(0.12, 2.1, 0.12, 0x2563eb, px, 0, pz);
      b.box(1.3, 0.12, 1.3, 0xf59e0b, 5, 2.1, -4.4);
      b.box(0.06, 2.1, 0.06, 0x2563eb, 3.85, 0, -4.1);
      b.box(0.06, 2.1, 0.06, 0x2563eb, 3.85, 0, -4.7);
      for (let y = 0.3; y < 2.1; y += 0.35) b.box(0.06, 0.06, 0.6, 0x2563eb, 3.85, y, -4.4);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 3.75), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
      board.position.set(5, 1.22, -2.4);
      board.rotation.x = 0.548;
      board.castShadow = true;
      b.group.add(board);
      b.col(4.4, 5.6, -5.0, -3.7);
      b.col(4.5, 5.5, -3.7, -0.7);

      // cerca, árvores e sol
      for (let x = -10; x <= 10; x += 1.2) b.box(0.12, 0.9, 0.1, 0xffffff, x, 0, -5.6);
      b.box(22, 0.1, 0.08, 0xffffff, 0, 0.6, -5.6);
      for (const [tx, tz] of [[-9.5, -4.2], [9, 2.5], [-9.5, 3.5]]) {
        b.cyl(0.25, 1.6, 0x78350f, tx, 0, tz, true);
        b.sph(1.0, 0x22c55e, tx, 2.2, tz);
      }
      const sun = emojiSprite('☀️', 2.4);
      sun.position.set(8, 6, -6);
      b.group.add(sun);
    },
  },

  // ============================================================ SALA (volta para casa)
  {
    id: 'sala',
    free: true,
    world: 3,
    story: [{ icon: '🧸', text: 'Em casa eu guardo os brinquedos.' }, { icon: '👟', text: 'Eu arrumo os sapatos.' }, { icon: '📖', text: 'Depois eu leio um livro.' }],
    name: 'Sala',
    icon: '🛋️',
    intro: 'Você voltou para casa. Vamos arrumar a sala.',
    sky: 0xfdba74,
    floor: 0xd4a373,
    wall: 0xddd6fe,
    steps: [
      { label: 'Guardar os brinquedos', icon: '🧸', say: '{nome}, guarde os brinquedos na caixa.', x: -4.2, z: 2.3, look: [-6.1, 2], action: 'toys' },
      { label: 'Arrumar os sapatos', icon: '👟', say: 'Arrume os sapatos na sapateira.', x: 3.6, z: 2.3, look: [3.6, 3.4], action: 'shoes' },
      { label: 'Regar a planta', icon: '🪴', say: 'Agora, regue a plantinha.', x: 4.3, z: -2.4, look: [5, -4], action: 'plant' },
      { label: 'Ler um livro', icon: '📖', say: 'Para terminar, pegue um livro e leia.', x: -5.5, z: -2.7, look: [-5.5, -3.7], action: 'book' },
    ],
    furnish: (b) => {
      // sofá
      b.box(4, 0.9, 1.4, 0x6366f1, 0, 0, -4.1, true);
      b.box(4, 1.3, 0.4, 0x4f46e5, 0, 0.9, -4.6);
      b.box(0.4, 1.3, 1.4, 0x4f46e5, -2.2, 0, -4.1, true);
      b.box(0.4, 1.3, 1.4, 0x4f46e5, 2.2, 0, -4.1, true);
      b.box(1.1, 0.25, 1.0, 0xa5b4fc, -1, 0.9, -4.0);
      b.box(1.1, 0.25, 1.0, 0xa5b4fc, 1, 0.9, -4.0);
      b.box(1.4, 1, 0.05, 0xfcd34d, 0, 2.6, -4.97);
      b.box(1.2, 0.8, 0.06, 0xfb7185, 0, 2.7, -4.96);

      // estante com livros
      b.box(2, 3, 1, 0x92400e, -5.5, 0, -4.3, true);
      const colors = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316];
      for (const y of [0.3, 1.3, 2.3]) {
        b.box(1.9, 0.05, 0.4, 0xb45309, -5.5, y, -3.65);
        colors.forEach((c, i) => {
          if (y === 1.3 && i === 2) return;
          b.box(0.22, 0.55, 0.4, c, -6.2 + i * 0.3, y + 0.05, -3.65);
        });
      }
      const book = b.pivot('book', -5.6, 1.35, -3.65);
      b.box(0.24, 0.5, 0.1, 0xdc2626, 0, 0, 0, false, book);
      b.box(0.2, 0.46, 0.07, 0xfef9c3, 0.02, 0.02, 0, false, book);

      // planta
      b.cyl(0.4, 0.5, 0xc2410c, 5, 0, -4.0, true);
      const plant = b.pivot('plant', 5, 0.5, -4.0);
      b.sph(0.35, 0x22c55e, 0, 0.35, 0, plant);
      b.sph(0.25, 0x16a34a, 0.25, 0.2, 0.1, plant);
      b.sph(0.25, 0x16a34a, -0.25, 0.25, -0.1, plant);
      const fl = new THREE.Group();
      plant.add(fl);
      fl.visible = false;
      b.sph(0.1, 0xf472b6, 0.2, 0.75, 0.1, fl);
      b.sph(0.1, 0xfacc15, -0.15, 0.8, 0, fl);
      b.sph(0.1, 0xf472b6, 0, 0.9, -0.12, fl);
      b.props['flowers'] = fl;

      // sapateira + sapatos
      b.box(1, 1.2, 2, 0xb45309, 6.4, 0, -2.5, true);
      const s1 = b.pivot('shoes1', 3.0, 0, 3.2);
      b.box(0.22, 0.15, 0.5, 0xef4444, -0.18, 0, 0, false, s1);
      b.box(0.22, 0.15, 0.5, 0xef4444, 0.18, 0, 0, false, s1);
      const s2 = b.pivot('shoes2', 4.4, 0, 3.5);
      s2.rotation.y = 0.6;
      b.box(0.22, 0.15, 0.5, 0x3b82f6, -0.18, 0, 0, false, s2);
      b.box(0.22, 0.15, 0.5, 0x3b82f6, 0.18, 0, 0, false, s2);

      // caixa de brinquedos + brinquedos
      const tb = b.pivot('toybox', -6.1, 0, 2.0);
      b.box(1.4, 0.8, 1.2, 0xf59e0b, 0, 0, 0, false, tb);
      b.box(1.2, 0.04, 1.0, 0x78350f, 0, 0.78, 0, false, tb);
      b.col(-6.8, -5.4, 1.4, 2.6);
      const t1 = b.pivot('toy1', -2.5, 0, 1.0);
      b.box(0.4, 0.4, 0.4, 0xef4444, 0, 0, 0, false, t1);
      const t2 = b.pivot('toy2', -3.4, 0, 3.4);
      b.sph(0.25, 0x3b82f6, 0, 0.25, 0, t2);
      const t3 = b.pivot('toy3', -1.2, 0, 3.0);
      b.cyl(0.2, 0.5, 0xfacc15, 0, 0, 0, false, t3);
      b.sph(0.15, 0xec4899, 0, 0.55, 0, t3);

      b.cyl(2.5, 0.04, 0xfda4af, 0, 0, 0.5);
    },
  },

  // ============================================================ NOITE
  {
    id: 'noite',
    world: 3,
    story: [{ icon: '🌙', text: 'À noite é hora de dormir.' }, { icon: '📖', text: 'Eu visto o pijama e leio uma história.' }, { icon: '💡', text: 'Eu apago a luz e durmo bem.' }],
    name: 'Hora de dormir',
    icon: '🌙',
    intro: 'Já é noite. Está na hora de dormir.',
    sky: 0x1e1b4b,
    night: true,
    floor: 0xd9a066,
    wall: 0x93c5fd,
    steps: [
      { label: 'Vestir o pijama', icon: '👕', say: '{nome}, vá até o guarda-roupa e vista o pijama.', x: 3.5, z: -2.6, look: [3.5, -4.2], action: 'dress' },
      { label: 'Ler uma história', icon: '📖', say: 'Agora, pegue um livro e leia uma história.', x: -1.2, z: -2.7, look: [-1.2, -3.7], action: 'book' },
      { label: 'Apagar a luz', icon: '💡', say: 'Vá até o interruptor e apague a luz.', x: 0.9, z: -3.0, look: [0.9, -5], action: 'lightsOff' },
      { label: 'Dormir', icon: '😴', say: 'Pronto! Agora, deite na cama e durma bem.', x: -2.6, z: -2.4, look: [-4.6, -3], action: 'sleep' },
    ],
    furnish: (b) => {
      bedroom(b, true);
      // estante com o livro da história
      b.box(2, 3, 1, 0x92400e, -1.2, 0, -4.3, true);
      for (const y of [0.3, 1.3, 2.3]) b.box(1.9, 0.05, 0.4, 0xb45309, -1.2, y, -3.65);
      [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15].forEach((c, i) => b.box(0.22, 0.55, 0.4, c, -1.9 + i * 0.3, 0.35, -3.65));
      const book = b.pivot('book', -1.2, 1.35, -3.65);
      b.box(0.24, 0.5, 0.1, 0xdc2626, 0, 0, 0, false, book);
      b.box(0.2, 0.46, 0.07, 0xfef9c3, 0.02, 0.02, 0, false, book);
      // interruptor
      b.box(0.3, 0.45, 0.05, 0xf1f5f9, 0.9, 1.2, -4.95);
      b.props['switch'] = b.box(0.12, 0.2, 0.08, 0xfacc15, 0.9, 1.33, -4.9);
      // lua e estrelas na janela
      const moon = emojiSprite('🌙', 0.9);
      moon.position.set(0.5, 2.0, -4.85);
      b.group.add(moon);
      [[-0.6, 2.2], [0.1, 1.5], [0.9, 1.4], [-0.3, 1.3]].forEach(([x, y]) => {
        const st = emojiSprite('⭐', 0.25);
        st.position.set(x, y, -4.85);
        b.group.add(st);
      });
    },
  },

  // ============================================================ MERCADO
  {
    id: 'mercado',
    world: 4,
    story: [{ icon: '🛒', text: 'No mercado eu pego as compras.' }, { icon: '🍞', text: 'Eu pego pão, leite e frutas.' }, { icon: '🧾', text: 'No caixa eu pago e agradeço.' }],
    name: 'Mercado',
    icon: '🛒',
    intro: 'Vamos ao mercado fazer compras!',
    sky: 0x93c5fd,
    floor: 0xf1f5f9,
    tile: 0xcbd5e1,
    wall: 0xfef9c3,
    steps: [
      { label: 'Pegar o pão', icon: '🍞', say: '{nome}, pegue o pão na prateleira.', x: -4.5, z: -2.5, look: [-4.5, -3.75], action: 'pickBread' },
      { label: 'Pegar o leite', icon: '🥛', say: 'Agora, pegue o leite.', x: 0, z: -2.5, look: [0, -3.75], action: 'pickMilk' },
      { label: 'Pegar as frutas', icon: '🍊', say: 'Pegue as frutas.', x: 4.5, z: -2.5, look: [4.5, -3.75], action: 'pickFruit' },
      { label: 'Pagar no caixa', icon: '🧾', say: 'Vá até o caixa e pague as compras.', x: 5.0, z: 0.9, look: [5, -0.5], action: 'pay' },
    ],
    furnish: (b) => {
      // 3 prateleiras com produtos
      for (const x of [-4.5, 0, 4.5]) {
        b.box(3, 2.4, 0.9, 0x94a3b8, x, 0, -4.3, true);
        for (const y of [0.6, 1.3, 2.0]) {
          b.box(2.9, 0.05, 0.5, 0xe2e8f0, x, y, -3.85);
          for (let i = 0; i < 5; i++) b.box(0.3, 0.3, 0.3, [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7][(i + y * 3) % 5 | 0], x - 1.2 + i * 0.6, y + 0.05, -3.85);
        }
      }
      const bread = b.pivot('bread', -4.5, 1.3, -3.75);
      b.box(0.6, 0.25, 0.3, 0xb45309, 0, 0, 0, false, bread);
      b.box(0.5, 0.1, 0.25, 0xd97706, 0, 0.25, 0, false, bread);
      const milk = b.pivot('milk', 0, 1.3, -3.75);
      b.box(0.28, 0.5, 0.28, 0xffffff, 0, 0, 0, false, milk);
      b.box(0.28, 0.12, 0.28, 0x3b82f6, 0, 0.5, 0, false, milk);
      const fruit = b.pivot('fruit', 4.5, 1.3, -3.75);
      b.box(0.6, 0.15, 0.4, 0x92400e, 0, 0, 0, false, fruit);
      for (const [fx, fz] of [[-0.15, 0], [0.15, 0.05], [0, -0.08]]) b.sph(0.13, 0xfb923c, fx, 0.27, fz, fruit);

      // carrinho
      const cart = b.pivot('cart', -1.5, 0, 1.0);
      b.box(0.9, 0.08, 0.6, 0x94a3b8, 0, 0.4, 0, false, cart);
      b.box(0.9, 0.35, 0.04, 0x64748b, 0, 0.45, 0.3, false, cart);
      b.box(0.9, 0.35, 0.04, 0x64748b, 0, 0.45, -0.3, false, cart);
      b.box(0.04, 0.35, 0.6, 0x64748b, 0.45, 0.45, 0, false, cart);
      b.box(0.04, 0.35, 0.6, 0x64748b, -0.45, 0.45, 0, false, cart);
      b.box(0.04, 0.5, 0.6, 0x475569, 0.45, 0.8, 0, false, cart);
      for (const [wx, wz] of [[-0.35, -0.22], [0.35, -0.22], [-0.35, 0.22], [0.35, 0.22]]) b.sph(0.07, 0x111827, wx, 0.07, wz, cart);

      // caixa, caixa (pessoa) e sacola
      b.box(2.2, 1.0, 1.0, 0x64748b, 5.0, 0, -0.5, true);
      b.box(0.5, 0.3, 0.4, 0x1f2937, 5.6, 1.0, -0.5);
      const ck = b.pivot('cashier', 5.0, 0, -1.7);
      b.box(0.6, 0.9, 0.35, 0x22c55e, 0, 0.75, 0, false, ck);
      b.box(0.26, 0.75, 0.3, 0x1e3a8a, -0.16, 0, 0, false, ck);
      b.box(0.26, 0.75, 0.3, 0x1e3a8a, 0.16, 0, 0, false, ck);
      b.box(0.5, 0.5, 0.5, 0xfcd9b6, 0, 1.65, 0, false, ck);
      b.box(0.54, 0.2, 0.54, 0x1f2937, 0, 2.05, -0.02, false, ck);
      b.box(0.07, 0.07, 0.04, 0x1f2937, -0.12, 1.85, 0.26, false, ck);
      b.box(0.07, 0.07, 0.04, 0x1f2937, 0.12, 1.85, 0.26, false, ck);
      const bag = b.pivot('bag', 4.2, 1.0, -0.5);
      b.box(0.4, 0.5, 0.25, 0xd97706, 0, 0, 0, false, bag);
      bag.visible = false;
      b.cyl(1.8, 0.03, 0xfda4af, -1, 0, 1.8);
    },
  },

  // ============================================================ DENTISTA
  {
    id: 'dentista',
    world: 4,
    story: [{ icon: '🦷', text: 'O dentista cuida dos meus dentes.' }, { icon: '😮', text: 'Ele pede para eu abrir a boca. Não dói.' }, { icon: '🌟', text: 'No final eu ganho um adesivo!' }],
    name: 'Dentista',
    icon: '🦷',
    intro: 'Hoje vamos ao dentista cuidar dos dentinhos.',
    sky: 0xa7f3d0,
    floor: 0xe0f2fe,
    tile: 0xf1f5f9,
    wall: 0xccfbf1,
    steps: [
      { label: 'Deitar na cadeira', icon: '💺', say: '{nome}, deite na cadeira do dentista. Fique tranquilo.', x: 1.6, z: -1.8, look: [0, -2.4], action: 'sitChair' },
      { label: 'Abrir a boca', icon: '😮', say: 'Agora, abra a boca bem grande.', x: 0, z: -1.5, look: [0, -3.5], action: 'openMouth', auto: true },
      { label: 'Enxaguar a boca', icon: '💧', say: 'Muito bem! Agora, enxague a boca com água.', x: 4.2, z: -2.6, look: [4.2, -4.3], action: 'rinse', auto: true },
      { label: 'Escolher um adesivo', icon: '🌟', say: 'Você foi muito corajoso! Escolha um adesivo.', x: -4.6, z: -1.8, look: [-6.8, -1.8], action: 'sticker' },
    ],
    furnish: (b) => {
      // cadeira reclinada
      b.cyl(0.35, 0.5, 0x64748b, 0, 0, -2.4);
      b.box(1.0, 0.25, 2.2, 0x38bdf8, 0, 0.5, -2.4, true);
      b.box(0.7, 0.3, 0.3, 0x0ea5e9, 0, 0.75, -3.65);
      b.box(0.1, 0.5, 1.5, 0x0284c7, -0.55, 0.75, -2.5);
      b.box(0.1, 0.5, 1.5, 0x0284c7, 0.55, 0.75, -2.5);
      // lâmpada do dentista
      b.box(0.08, 1.2, 0.08, 0x94a3b8, 0, 2.2, -3.2);
      b.box(0.08, 0.08, 1.0, 0x94a3b8, 0, 3.35, -2.7);
      b.cyl(0.4, 0.12, 0xfef08a, 0, 3.15, -2.3);
      // dentista (jaleco branco)
      const d = b.pivot('dentist', -1.3, 0, -2.6);
      d.rotation.y = Math.PI / 2;
      b.box(0.6, 0.95, 0.35, 0xffffff, 0, 0.75, 0, false, d);
      b.box(0.26, 0.75, 0.3, 0x0ea5e9, -0.16, 0, 0, false, d);
      b.box(0.26, 0.75, 0.3, 0x0ea5e9, 0.16, 0, 0, false, d);
      b.box(0.18, 0.8, 0.22, 0xffffff, -0.4, 0.8, 0, false, d);
      b.box(0.18, 0.8, 0.22, 0xffffff, 0.4, 0.8, 0, false, d);
      b.box(0.5, 0.5, 0.5, 0xfcd9b6, 0, 1.65, 0, false, d);
      b.box(0.54, 0.2, 0.54, 0x1f2937, 0, 2.05, -0.02, false, d);
      b.box(0.5, 0.2, 0.05, 0x7dd3fc, 0, 1.6, 0.27, false, d);
      b.box(0.07, 0.07, 0.04, 0x1f2937, -0.12, 1.85, 0.26, false, d);
      b.box(0.07, 0.07, 0.04, 0x1f2937, 0.12, 1.85, 0.26, false, d);
      // bandeja com ferramentas
      b.box(0.9, 1.0, 0.7, 0xe2e8f0, -2.4, 0, -4.2, true);
      b.box(0.3, 0.04, 0.04, 0x94a3b8, -2.5, 1.0, -4.2);
      b.box(0.04, 0.04, 0.3, 0x94a3b8, -2.2, 1.0, -4.2);
      // pia para enxaguar
      b.box(1.6, 1.0, 0.9, 0xe2e8f0, 4.2, 0, -4.4, true);
      b.cyl(0.4, 0.1, 0x38bdf8, 4.2, 1.0, -4.4);
      b.box(0.1, 0.45, 0.1, 0x94a3b8, 4.2, 1.0, -4.75);
      b.box(0.08, 0.08, 0.35, 0x94a3b8, 4.2, 1.4, -4.6);
      b.props['cup'] = b.cyl(0.1, 0.18, 0xffffff, 3.6, 1.0, -4.4);
      // cartaz do dente e estante de adesivos
      const tooth = emojiSprite('🦷', 1.4);
      tooth.position.set(1.5, 2.6, -4.9);
      b.group.add(tooth);
      b.box(0.1, 1.2, 2.4, 0xfde68a, -6.85, 1.0, -1.8);
      ['⭐', '🦄', '🚀'].forEach((e, i) => {
        const sp = emojiSprite(e, 0.55);
        sp.position.set(-6.7, 1.6, -2.5 + i * 0.7);
        b.group.add(sp);
        b.props['stk' + i] = sp;
      });
      b.box(2.2, 0.04, 1.4, 0x86efac, -4.6, 0, -1.8);
    },
  },
];