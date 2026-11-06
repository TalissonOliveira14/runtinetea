import * as THREE from 'three';

export const ROOM_W = 14; // x: -7 .. 7
export const ROOM_D = 10; // z: -5 .. 5 (parede de fundo em z = -5, frente aberta para a câmera)

export type Collider = [number, number, number, number]; // minX, maxX, minZ, maxZ

export interface StepDef {
  label: string;
  icon: string;
  x: number;
  z: number;
}

export interface RoomDef {
  id: string;
  name: string;
  icon: string;
  floor: number;
  tile?: number; // segunda cor do piso quadriculado
  wall: number;
  steps: StepDef[];
  furnish: (b: Builder) => void;
}

// ------------------------------------------------------------------ helper de construção

export class Builder {
  group = new THREE.Group();
  colliders: Collider[] = [];
  private mats = new Map<number, THREE.MeshStandardMaterial>();

  private mat(color: number): THREE.MeshStandardMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
      this.mats.set(color, m);
    }
    return m;
  }

  /** y = altura da base do objeto */
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, collide = false): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.col(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    return mesh;
  }

  cyl(r: number, h: number, color: number, x: number, y: number, z: number, collide = false): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), this.mat(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.col(x - r, x + r, z - r, z + r);
    return mesh;
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
  tex.repeat.set(ROOM_W / 2, ROOM_D / 2); // cada quadrado = 1 unidade
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(def: RoomDef): { group: THREE.Group; colliders: Collider[] } {
  const b = new Builder();

  // Piso (topo em y = 0)
  const floorMat = new THREE.MeshStandardMaterial({
    color: def.tile ? 0xffffff : def.floor,
    map: def.tile ? checker(def.floor, def.tile) : null,
    roughness: 0.5,
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.3, ROOM_D), floorMat);
  floor.position.set(0, -0.15, 0);
  floor.receiveShadow = true;
  b.group.add(floor);

  // Paredes: fundo + laterais (a frente fica aberta, é por onde a câmera olha)
  b.box(ROOM_W + 0.6, 5, 0.3, def.wall, 0, 0, -ROOM_D / 2 - 0.15);
  b.box(0.3, 5, ROOM_D + 0.3, def.wall, -ROOM_W / 2 - 0.15, 0, 0);
  b.box(0.3, 5, ROOM_D + 0.3, def.wall, ROOM_W / 2 + 0.15, 0, 0);

  def.furnish(b);
  return { group: b.group, colliders: b.colliders };
}

// ------------------------------------------------------------------ cômodos

export const ROOMS: RoomDef[] = [
  {
    id: 'quarto',
    name: 'Quarto',
    icon: '🛏️',
    floor: 0xd9a066,
    wall: 0xbfdbfe,
    steps: [
      { label: 'Levantar da cama', icon: '🛏️', x: -2.6, z: -2.4 },
      { label: 'Arrumar a cama', icon: '✨', x: -4.6, z: -0.4 },
      { label: 'Trocar de roupa', icon: '👕', x: 3.5, z: -2.6 },
      { label: 'Pegar a mochila', icon: '🎒', x: 5, z: 2.8 },
    ],
    furnish: (b) => {
      // cama
      b.box(2.4, 0.5, 3.6, 0x92400e, -4.6, 0, -3, true);
      b.box(2.2, 0.3, 3.4, 0xf8fafc, -4.6, 0.5, -3);
      b.box(2.25, 0.34, 2.0, 0x3b82f6, -4.6, 0.55, -2.3);
      b.box(1.6, 0.25, 0.8, 0xffffff, -4.6, 0.8, -4.2);
      b.box(2.4, 1.4, 0.2, 0x78350f, -4.6, 0, -4.8);
      // guarda-roupa
      b.box(3, 4, 1.2, 0x7c3aed, 3.5, 0, -4.2, true);
      b.box(0.06, 3.6, 0.05, 0x4c1d95, 3.5, 0.2, -3.58);
      b.box(0.1, 0.5, 0.06, 0xfacc15, 3.3, 1.6, -3.56);
      b.box(0.1, 0.5, 0.06, 0xfacc15, 3.7, 1.6, -3.56);
      // janela
      b.box(2.4, 1.8, 0.05, 0xffffff, 0, 1.6, -4.98);
      b.box(2.1, 1.5, 0.06, 0x7dd3fc, 0, 1.75, -4.96);
      // escrivaninha
      b.box(1.4, 0.9, 2, 0xd97706, 6.3, 0, 0.3, true);
      b.box(0.5, 0.1, 0.7, 0xef4444, 6.3, 0.9, 0.3);
      // tapete
      b.cyl(2.2, 0.04, 0xfda4af, -0.5, 0, 1.2);
      // mochila
      b.box(0.7, 0.9, 0.4, 0xf97316, 5, 0, 2.8);
      b.box(0.5, 0.4, 0.1, 0xfdba74, 5, 0.15, 3.03);
    },
  },
  {
    id: 'banheiro',
    name: 'Banheiro',
    icon: '🛁',
    floor: 0xe0f2fe,
    tile: 0xbae6fd,
    wall: 0xa7f3d0,
    steps: [
      { label: 'Usar o vaso', icon: '🚽', x: 4.6, z: -2.5 },
      { label: 'Lavar as mãos', icon: '🧼', x: 0, z: -2.7 },
      { label: 'Escovar os dentes', icon: '🪥', x: 5.4, z: 0.5 },
      { label: 'Tomar banho', icon: '🚿', x: -5, z: -2.6 },
    ],
    furnish: (b) => {
      // chuveiro
      b.box(3, 0.04, 3, 0x93c5fd, -5, 0, -3.4);
      b.box(0.1, 3.4, 0.1, 0x94a3b8, -6.2, 0, -4.6);
      b.cyl(0.35, 0.1, 0x94a3b8, -5.9, 3.3, -4.4);
      b.box(0.08, 3, 3, 0xa5f3fc, -3.45, 0.2, -3.4, true);
      // pia + espelho
      b.box(2.2, 1, 1, 0xe2e8f0, 0, 0, -4.3, true);
      b.cyl(0.5, 0.1, 0x38bdf8, 0, 1, -4.3);
      b.box(0.1, 0.3, 0.1, 0x94a3b8, 0, 1.05, -4.65);
      b.box(1.8, 1.5, 0.05, 0x64748b, 0, 1.75, -4.98);
      b.box(1.6, 1.3, 0.06, 0xbae6fd, 0, 1.85, -4.96);
      // vaso
      b.cyl(0.4, 0.7, 0xffffff, 4.6, 0, -3.8, true);
      b.box(0.9, 0.9, 0.4, 0xffffff, 4.6, 0.7, -4.5, true);
      // armário com copo de escovas
      b.box(0.9, 1.2, 1.6, 0x14b8a6, 6.5, 0, 0.5, true);
      b.cyl(0.1, 0.25, 0xf472b6, 6.5, 1.2, 0.3);
      // tapete de banho
      b.box(1.4, 0.04, 0.9, 0xfb7185, -1.5, 0, 0.5);
    },
  },
  {
    id: 'cozinha',
    name: 'Cozinha',
    icon: '🍳',
    floor: 0xfef3c7,
    tile: 0xfde68a,
    wall: 0xfecaca,
    steps: [
      { label: 'Pegar uma fruta', icon: '🍎', x: -5.5, z: -2.6 },
      { label: 'Comer à mesa', icon: '🍽️', x: 1.5, z: 1.4 },
      { label: 'Levar o prato à pia', icon: '🧽', x: 3.5, z: -2.6 },
      { label: 'Guardar no armário', icon: '🗄️', x: 5.3, z: 1.5 },
    ],
    furnish: (b) => {
      // geladeira
      b.box(1.6, 3.2, 1.4, 0xf1f5f9, -5.5, 0, -4.1, true);
      b.box(0.08, 1.2, 0.1, 0x64748b, -4.8, 1.5, -3.35);
      // mesa + cadeiras
      b.box(2.8, 0.15, 1.8, 0xb45309, 1.5, 0.85, -0.5);
      for (const [lx, lz] of [[0.3, -1.2], [2.7, -1.2], [0.3, 0.2], [2.7, 0.2]]) b.box(0.15, 0.85, 0.15, 0x92400e, lx, 0, lz);
      b.col(0.1, 2.9, -1.4, 0.4);
      b.cyl(0.3, 0.04, 0xffffff, 1.5, 1.0, -0.5);
      b.box(0.22, 0.22, 0.22, 0xef4444, 1.5, 1.04, -0.5);
      for (const cx of [-0.5, 3.5]) {
        b.box(0.6, 0.45, 0.6, 0xef4444, cx, 0, -0.5, true);
        b.box(0.1, 0.6, 0.6, 0xdc2626, cx + (cx < 1 ? -0.25 : 0.25), 0.45, -0.5);
      }
      // balcão com pia e fogão
      b.box(4.4, 1.0, 1.4, 0xfef3c7, 3.5, 0, -4.1, true);
      b.box(4.4, 0.1, 1.4, 0x94a3b8, 3.5, 1.0, -4.1);
      b.cyl(0.5, 0.1, 0x7dd3fc, 3.5, 1.05, -4.1);
      b.box(0.1, 0.35, 0.1, 0x64748b, 3.5, 1.1, -4.55);
      b.cyl(0.3, 0.05, 0x1f2937, 5.0, 1.1, -4.1);
      b.box(3, 1, 0.8, 0xc2410c, 3.5, 2.6, -4.5);
      // armário alto
      b.box(1.2, 3.6, 2, 0xc2410c, 6.4, 0, 1.5, true);
      b.box(0.05, 3.2, 0.9, 0x9a3412, 5.78, 0.2, 1.05);
      b.box(0.05, 3.2, 0.9, 0x9a3412, 5.78, 0.2, 1.95);
      // tapete
      b.box(2.4, 0.04, 1.4, 0x86efac, 1.5, 0, 2.6);
    },
  },
];