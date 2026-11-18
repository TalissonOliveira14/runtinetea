import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { emojiSprite } from './fx';
import { ClothBlanket } from './cloth';
import { makePack } from './action-kit';

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

export type ModelFolder = 'furniture' | 'vehicles' | 'food' | 'props';

// Cache global dos modelos .glb da Kenney para evitar recarregamento entre salas
const gltfLoader = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Group>>();

function loadGlb(name: string, folder: ModelFolder = 'furniture'): Promise<THREE.Group> {
  const key = `${folder}/${name}`;
  let cached = glbCache.get(key);
  if (!cached) {
    cached = gltfLoader.loadAsync(`assets/models/${key}.glb`).then((gltf) => gltf.scene);
    glbCache.set(key, cached);
  }
  return cached.then((scene) => scene.clone(true));
}

export interface GlbOpts {
  folder?: ModelFolder;
  rotY?: number;
  targetW?: number;
  targetH?: number;
  targetD?: number;
  scale?: number;
  collide?: boolean;
  parent?: THREE.Object3D;
}

// ------------------------------------------------------------------ helper de construção

export class Builder {
  group = new THREE.Group();
  colliders: Collider[] = [];
  props: Record<string, THREE.Object3D> = {};
  mixers: THREE.AnimationMixer[] = [];
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

  /** Carrega um modelo .glb da Kenney, centraliza X/Z, apoia em y=0 e aplica escala/colisor */
  glb(name: string, x: number, y: number, z: number, opts: GlbOpts = {}): THREE.Group {
    const anchor = new THREE.Group();
    anchor.position.set(x, y, z);
    anchor.rotation.y = opts.rotY ?? 0;
    (opts.parent ?? this.group).add(anchor);

    if (opts.collide && opts.targetW && opts.targetD) {
      const rot = Math.abs(Math.sin(opts.rotY ?? 0)) > 0.7;
      const cw = rot ? opts.targetD : opts.targetW;
      const cd = rot ? opts.targetW : opts.targetD;
      this.col(x - cw / 2, x + cw / 2, z - cd / 2, z + cd / 2);
    }

    loadGlb(name, opts.folder ?? 'furniture')
      .then((model) => {
        model.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              const sm = mat as THREE.MeshStandardMaterial;
              if (sm.map) sm.map.colorSpace = THREE.SRGBColorSpace;
              if (typeof sm.roughness === 'number') sm.roughness = Math.max(sm.roughness, 0.72);
            });
          }
        });
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model, true);
        const size = new THREE.Vector3();
        box.getSize(size);

        if (size.x > 0 && size.y > 0 && size.z > 0) {
          if (opts.targetW || opts.targetH || opts.targetD) {
            const sx = opts.targetW ? opts.targetW / size.x : undefined;
            const sy = opts.targetH ? opts.targetH / size.y : undefined;
            const sz = opts.targetD ? opts.targetD / size.z : undefined;
            const fallback = sx ?? sy ?? sz ?? 1;
            model.scale.set(sx ?? fallback, sy ?? fallback, sz ?? fallback);
          } else {
            model.scale.setScalar(opts.scale ?? 2.2);
          }
          model.updateMatrixWorld(true);
          const sb = new THREE.Box3().setFromObject(model, true);
          const center = new THREE.Vector3();
          sb.getCenter(center);
          model.position.set(-center.x, -sb.min.y, -center.z);
        }
        anchor.add(model);
      })
      .catch((err) => console.warn(`Modelo ${name}.glb não carregado:`, err));

    return anchor;
  }


  /** Personagem 3D articulado (Professora, Caixa, Dentista) com animação idle */
  npc(
    propName: string,
    modelType: 'menina' | 'menino',
    x: number,
    z: number,
    rotY: number,
    colors: { top?: number; pants?: number; hair?: number } = {}
  ): THREE.Group {
    const g = this.pivot(propName, x, 0, z);
    g.rotation.y = rotY;
    this.col(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
    const loader = new FBXLoader();
    Promise.all([
      loader.loadAsync(`assets/models/${modelType}.fbx`),
      loader.loadAsync('assets/models/idle.fbx'),
    ])
      .then(([fbx, idleFbx]) => {
        fbx.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(fbx, true);
        const rawH = box.max.y - box.min.y;
        if (isFinite(rawH) && rawH > 0) {
          fbx.scale.multiplyScalar(1.88 / rawH);
          fbx.updateMatrixWorld(true);
          const sb = new THREE.Box3().setFromObject(fbx, true);
          fbx.position.y -= sb.min.y;
        }
        fbx.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
          mesh.material = mats.map((m) => {
            const cl = m.clone();
            const n = cl.name.toLowerCase();
            if (colors.top && /shirt|top|jacket|hoodie|torso|cloth|sweater|coat|blouse/.test(n)) cl.color.setHex(colors.top);
            if (colors.pants && /pant|trouser|short|skirt|bottom|jean/.test(n)) cl.color.setHex(colors.pants);
            if (colors.hair && /hair|cabelo/.test(n)) cl.color.setHex(colors.hair);
            return cl;
          });
          if (Array.isArray(mesh.material) && mesh.material.length === 1) mesh.material = mesh.material[0];
        });
        g.add(fbx);
        if (idleFbx.animations.length) {
          const boneNames: string[] = [];
          fbx.traverse((o) => { if ((o as THREE.Bone).isBone) boneNames.push(o.name); });
          const usesColon = boneNames.some((n) => n.includes(':'));
          const clip = idleFbx.animations[0].clone();
          clip.tracks = clip.tracks.filter((t) => !/Hips\.position$/i.test(t.name));
          clip.tracks.forEach((t) => {
            t.name = usesColon
              ? t.name.replace(/^mixamorig(?!:)/, 'mixamorig:')
              : t.name.replace(/^mixamorig:/, 'mixamorig');
          });
          const mixer = new THREE.AnimationMixer(fbx);
          mixer.clipAction(clip).play();
          this.mixers.push(mixer);
        }
      })
      .catch((err) => console.warn(`NPC ${propName} erro:`, err));
    return g;
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
  b.group.userData['mixers'] = b.mixers;
  return { group: b.group, colliders: b.colliders, props: b.props };
}

// ------------------------------------------------------------------ cômodos

/** Quarto completo (usado de manhã e à noite) */
function bedroom(b: Builder, night: boolean): void {
  // cama 3D Kenney + travesseiro 3D
  b.glb('bedSingle', -4.6, 0, -3.0, { targetW: 2.4, targetH: 1.4, targetD: 3.6, collide: true });
  const pillow = b.pivot('pillow', -4.6, 0.925, -4.15);
  b.glb('pillow', 0, -0.125, 0, { targetW: 1.6, targetH: 0.25, targetD: 0.8, parent: pillow });

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

  // ursinho 3D Kenney no chão (a criança coloca no travesseiro no fim)
  const teddy = b.pivot('teddy', night ? -4.6 : -6.4, night ? 1.05 : 0, night ? -4.15 : -4.0);
  b.glb('bear', 0, 0, 0, { targetW: 0.55, targetH: 0.72, targetD: 0.5, parent: teddy });

  // "Zzz" sobre a cama
  const zzz = emojiSprite('💤', 1.2);
  zzz.position.set(-4.6, 2.6, -3.6);
  zzz.visible = !night;
  b.group.add(zzz);
  b.props['zzz'] = zzz;

  // guarda-roupa com portas que abrem
  b.glb('bookcaseClosed', 3.5, 0, -4.2, { targetW: 3.0, targetH: 4.0, targetD: 1.2, collide: true });
  b.box(2.8, 3.6, 0.04, 0x2e1065, 3.5, 0.2, -3.61);
  [[2.7, 0xf87171], [3.3, 0x34d399], [3.9, 0xfacc15], [4.4, 0x60a5fa]].forEach(([x, c]) => b.box(0.4, 0.8, 0.08, c, x, 2.2, -3.55));
  const wl = b.pivot('wardL', 2.1, 0.2, -3.55);
  b.box(1.4, 3.6, 0.06, 0x8b5cf6, 0.7, 0, 0, false, wl);
  b.box(0.08, 0.5, 0.06, 0xfacc15, 1.25, 1.5, 0.05, false, wl);
  const wr = b.pivot('wardR', 4.9, 0.2, -3.55);
  b.box(1.4, 3.6, 0.06, 0x8b5cf6, -0.7, 0, 0, false, wr);
  b.box(0.08, 0.5, 0.06, 0xfacc15, -1.25, 1.5, 0.05, false, wr);

  // janela, escrivaninha 3D Kenney, notebook, tapete
  b.box(2.4, 1.8, 0.05, 0xffffff, 0, 1.6, -4.98);
  b.box(2.1, 1.5, 0.06, 0x7dd3fc, 0, 1.75, -4.96);
  b.glb('desk', 6.3, 0, 0.3, { rotY: -Math.PI / 2, targetW: 2.0, targetH: 0.9, targetD: 1.4, collide: true });
  b.glb('laptop', 6.3, 0.9, 0.3, { rotY: -Math.PI / 2, targetW: 0.65, targetH: 0.42, targetD: 0.55 });
  b.glb('rugRound', -0.5, 0, 1.2, { targetW: 4.4, targetH: 0.04, targetD: 4.4 });

  // mochila 3D no chão
  const pack = b.pivot('pack', 5, 0, 2.8);
  pack.add(makePack());
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
      // chuveiro 3D Kenney
      b.glb('shower', -5, 0, -3.4, { targetW: 2.8, targetH: 3.3, targetD: 2.8 });
      b.col(-3.55, -3.35, -4.9, -1.9);

      // bancada com duas pias 3D Kenney e espelho
      b.glb('bathroomCabinetDrawer', 0, 0, -4.3, { targetW: 3.8, targetH: 1.0, targetD: 1.0, collide: true });
      for (const x of [-0.9, 0.9]) {
        b.glb('bathroomSink', x, 0, -4.25, { targetW: 1.1, targetH: 1.35, targetD: 0.95 });
      }
      b.glb('bathroomMirror', 0, 1.65, -4.94, { targetW: 3.2, targetH: 1.4, targetD: 0.12 });
      b.cyl(0.1, 0.25, 0xf472b6, 1.6, 1.0, -4.3);
      b.box(0.25, 0.12, 0.18, 0xfde047, -1.6, 1.0, -4.3);

      // vaso 3D Kenney + biombo de privacidade
      b.glb('toilet', 4.6, 0, -4.0, { targetW: 1.0, targetH: 1.4, targetD: 1.3, collide: true });
      const pv = b.pivot('privacy', 4.6, 0, -1.9);
      b.box(2.2, 2.4, 0.1, 0xf9a8d4, 0, 0, 0, false, pv);
      b.box(2.2, 0.1, 0.12, 0xec4899, 0, 2.3, 0, false, pv);
      pv.scale.y = 0.001;
      pv.visible = false;

      b.glb('washer', 6.45, 0, 0.5, { rotY: -Math.PI / 2, targetW: 1.5, targetH: 1.35, targetD: 1.0, collide: true });
      b.glb('rugRectangle', -1.5, 0, 0.5, { targetW: 1.6, targetH: 0.04, targetD: 1.0 });
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
      { label: 'Comer à mesa', icon: '🍽️', say: 'Vá até a cadeira e coma a sua fruta à mesa.', x: -0.45, z: 0.45, look: [1.5, -0.5], action: 'eat' },
      { label: 'Lavar o prato', icon: '🧽', say: 'Leve o prato até a pia e lave.', x: 3.5, z: -2.6, look: [3.5, -4.1], action: 'dishes' },
      { label: 'Guardar no armário', icon: '🗄️', say: 'Agora, guarde o prato no armário.', x: 5.3, z: 1.5, look: [6.4, 1.5], action: 'cabinet' },
    ],
    furnish: (b) => {
      // geladeira 3D Kenney + porta animada (fridgeDoor) + maçã 3D (apple)
      b.glb('kitchenFridgeLarge', -5.5, 0, -4.15, { targetW: 1.6, targetH: 3.2, targetD: 1.35, collide: true });
      const apple = b.pivot('apple', -5.2, 1.25, -3.6);
      b.glb('apple', 0, 0, 0, { folder: 'food', targetW: 0.32, targetH: 0.34, targetD: 0.32, parent: apple });
      b.pivot('fridgeDoor', -4.7, 0.1, -3.36);

      // mesa 3D Kenney, cadeiras e prato 3D
      b.glb('table', 1.5, 0, -0.5, { targetW: 2.8, targetH: 1.0, targetD: 1.8, collide: true });
      b.glb('chairCushion', -0.45, 0, -0.5, { rotY: Math.PI / 2, targetW: 0.75, targetH: 1.15, targetD: 0.75, collide: true });
      b.glb('chairCushion', 3.45, 0, -0.5, { rotY: -Math.PI / 2, targetW: 0.75, targetH: 1.15, targetD: 0.75, collide: true });
      const plate = b.pivot('plate', 1.5, 1.0, -0.5);
      b.glb('plate', 0, 0, 0, { folder: 'food', targetW: 0.65, targetH: 0.08, targetD: 0.65, parent: plate });
      const crumbs = b.box(0.18, 0.04, 0.12, 0xfbbf24, 0.05, 0.05, 0, false, plate);
      crumbs.visible = false;
      plate.userData['crumbs'] = crumbs;

      // balcão 3D Kenney com pia, fogão, coifa e armários aéreos
      b.glb('kitchenCabinet', 2.0, 0, -4.1, { targetW: 1.4, targetH: 1.05, targetD: 1.4, collide: true });
      b.glb('kitchenSink', 3.5, 0, -4.1, { targetW: 1.6, targetH: 1.4, targetD: 1.4, collide: true });
      b.glb('kitchenStove', 5.0, 0, -4.1, { targetW: 1.4, targetH: 1.35, targetD: 1.4, collide: true });
      b.glb('hoodModern', 5.0, 2.4, -4.3, { targetW: 1.4, targetH: 1.0, targetD: 0.9 });
      b.glb('kitchenCabinetUpperDouble', 2.8, 2.5, -4.5, { targetW: 2.4, targetH: 1.0, targetD: 0.75 });

      // armário alto 3D limpo
      b.glb('bookcaseOpen', 6.4, 0, 1.5, { rotY: -Math.PI / 2, targetW: 2.0, targetH: 3.2, targetD: 1.1, collide: true });
      b.pivot('cabL', 5.78, 0.2, 0.55);
      b.pivot('cabR', 5.78, 0.2, 2.45);
      b.glb('rugRectangle', 1.5, 0, 2.6, { targetW: 2.4, targetH: 0.04, targetD: 1.4 });
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
      // faixa de pedestres e semáforo interativo
      for (let z = -0.5; z <= 2.9; z += 0.68) b.box(1.5, 0.025, 0.34, 0xffffff, 0.5, 0.04, z);
      b.cyl(0.06, 2.5, 0x334155, -0.8, 0, -1.2, true);
      b.box(0.32, 0.72, 0.24, 0x1e293b, -0.8, 2.0, -1.2);
      b.props['lightRed'] = b.sph(0.09, 0xef4444, -0.8, 2.52, -1.07);
      b.props['lightGreen'] = b.sph(0.09, 0x14532d, -0.8, 2.22, -1.07);
      b.box(24, 0.1, 0.15, 0xcbd5e1, 0, 0, -1.0);
      b.col(-12, 12, -0.9, 6);

      // frente da casa em 3D (Kenney Suburban) + porta interativa animada
      b.glb('building-type-b', -7.0, 0, -6.3, { folder: 'props', targetW: 7.4, targetH: 5.2, targetD: 3.4, collide: true });
      b.glb('building-type-a', 1.2, 0, -6.5, { folder: 'props', targetW: 6.2, targetH: 4.8, targetD: 3.2, collide: true });
      b.box(1.26, 2.3, 0.14, 0x78350f, -7.0, 0, -4.56);
      b.box(1.08, 2.18, 0.06, 0x1e1b4b, -7.0, 0, -4.53);
      const door = b.pivot('houseDoor', -7.54, 0, -4.48);
      b.box(1.08, 2.18, 0.08, 0x9a3412, 0.54, 0, 0, false, door);
      b.box(0.1, 0.1, 0.1, 0xfacc15, 0.94, 1.1, 0.08, false, door);
      door.rotation.y = -1.5; // começa aberta

      // cercas e árvores 3D Kenney
      for (const fx of [-10.8, -3.2, -1.6, 0.0]) {
        b.glb('fence', fx, 0, -4.4, { folder: 'props', targetW: 1.5, targetH: 0.95, targetD: 0.25, collide: true });
      }
      b.glb('tree-large', -11.0, 0, -2.3, { folder: 'props', targetW: 2.2, targetH: 3.8, targetD: 2.2, collide: true });
      b.glb('tree', 9.5, 0, -4.5, { folder: 'props', targetW: 2.0, targetH: 3.5, targetD: 2.0, collide: true });
      b.glb('tree-small', -2.8, 0, -4.9, { folder: 'props', targetW: 1.4, targetH: 2.6, targetD: 1.4 });

      // ponto de ônibus + banco 3D Kenney
      b.cyl(0.07, 3, 0x64748b, 6.4, 0, -2.9, true);
      b.box(0.9, 0.9, 0.06, 0xfacc15, 6.4, 2.2, -2.9);
      const bs = emojiSprite('🚌', 0.7);
      bs.position.set(6.4, 2.65, -2.84);
      b.group.add(bs);
      b.glb('bench', 3.6, 0, -2.9, { targetW: 1.8, targetH: 0.85, targetD: 0.65, collide: true });

      // ônibus escolar 3D Kenney (chega de longe pela direita)
      const bus = b.pivot('bus', 32, 0, 1.4);
      b.glb('delivery', 0, 0, 0, { folder: 'vehicles', rotY: -Math.PI / 2, targetW: 2.5, targetH: 2.7, targetD: 6.8, parent: bus });
      const roof = emojiSprite('🏫', 1.1);
      roof.position.set(0, 3.2, 0);
      bus.add(roof);
      const dp = new THREE.Group();
      dp.position.set(-2.1, 0.35, -1.18);
      b.box(0.75, 1.55, 0.05, 0x38bdf8, 0.375, 0, 0, false, dp);
      bus.add(dp);
      b.props['busDoor'] = dp;

      // carro 3D Kenney que passa na hora de olhar a rua
      const car = b.pivot('car', 40, 0, 2.6);
      b.glb('sedan', 0, 0, 0, { folder: 'vehicles', rotY: -Math.PI / 2, targetW: 1.7, targetH: 1.4, targetD: 3.6, parent: car });
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

      // professora 3D articulada + mesa 3D Kenney
      b.glb('desk', 4.2, 0, -4.2, { targetW: 1.8, targetH: 0.9, targetD: 0.9, collide: true });
      b.npc('teacher', 'menina', 2.6, -3.4, 0, { top: 0x9333ea, pants: 0x1e3a8a, hair: 0x5c2d16 });

      // estantes 3D abertas para guardar mochilas
      b.glb('bookcaseOpen', -6.3, 0, -2.5, { rotY: Math.PI / 2, targetW: 1.8, targetH: 2.5, targetD: 0.9, collide: true });
      b.glb('bookcaseOpen', -6.3, 0, -0.5, { rotY: Math.PI / 2, targetW: 1.8, targetH: 2.5, targetD: 0.9, collide: true });

      // carteiras 3D Kenney: caderno (desenho) e lancheira
      for (const dx of [-1.0, 3.0]) {
        b.glb('desk', dx, 0, 0.8, { targetW: 1.6, targetH: 0.83, targetD: 0.9, collide: true });
        b.glb('chairDesk', dx, 0, 1.65, { rotY: Math.PI, targetW: 0.65, targetH: 0.9, targetD: 0.65, collide: true });
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
      const sw = b.pivot('sandwich', 3.0, 0.88, 0.8);
      b.glb('sandwich', 0, 0, 0, { folder: 'food', targetW: 0.36, targetH: 0.16, targetD: 0.34, parent: sw });

      // rodinha, janela, cartazes
      b.glb('rugRound', 1.0, 0, 2.4, { targetW: 3.2, targetH: 0.04, targetD: 3.2 });
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

      // banco 3D Kenney, cerca, árvores 3D e sol
      b.glb('bench', -1.5, 0, -4.2, { targetW: 2.0, targetH: 0.85, targetD: 0.7, collide: true });
      for (let x = -10; x <= 10; x += 1.2) b.box(0.12, 0.9, 0.1, 0xffffff, x, 0, -5.6);
      b.box(22, 0.1, 0.08, 0xffffff, 0, 0.6, -5.6);
      b.glb('tree-large', -9.5, 0, -4.2, { folder: 'props', targetW: 2.2, targetH: 3.8, targetD: 2.2, collide: true });
      b.glb('tree', 9.0, 0, 2.5, { folder: 'props', targetW: 2.0, targetH: 3.5, targetD: 2.0, collide: true });
      b.glb('tree', -9.5, 0, 3.5, { folder: 'props', targetW: 2.0, targetH: 3.5, targetD: 2.0, collide: true });
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
      // sofá 3D Kenney + luminária de chão + quadro
      b.glb('loungeSofaLong', 0, 0, -4.1, { targetW: 4.2, targetH: 1.35, targetD: 1.4, collide: true });
      b.glb('lampRoundFloor', -2.7, 0, -4.3, { targetW: 0.55, targetH: 2.1, targetD: 0.55, collide: true });
      b.box(1.4, 1, 0.05, 0xfcd34d, 0, 2.6, -4.97);
      b.box(1.2, 0.8, 0.06, 0xfb7185, 0, 2.7, -4.96);

      // estante 3D Kenney com livros + livro interativo
      b.glb('bookcaseOpen', -5.5, 0, -4.3, { targetW: 2.0, targetH: 3.0, targetD: 1.0, collide: true });
      b.glb('books', -5.9, 2.15, -4.2, { targetW: 0.8, targetH: 0.45, targetD: 0.45 });
      const book = b.pivot('book', -5.6, 1.35, -3.65);
      b.box(0.24, 0.5, 0.1, 0xdc2626, 0, 0, 0, false, book);
      b.box(0.2, 0.46, 0.07, 0xfef9c3, 0.02, 0.02, 0, false, book);

      // planta 3D Kenney
      b.col(4.5, 5.5, -4.5, -3.5);
      const plant = b.pivot('plant', 5, 0, -4.0);
      b.glb('pottedPlant', 0, 0, 0, { targetW: 0.95, targetH: 1.3, targetD: 0.95, parent: plant });
      const fl = new THREE.Group();
      plant.add(fl);
      fl.visible = false;
      b.sph(0.1, 0xf472b6, 0.2, 1.2, 0.1, fl);
      b.sph(0.1, 0xfacc15, -0.15, 1.25, 0, fl);
      b.sph(0.1, 0xf472b6, 0, 1.35, -0.12, fl);
      b.props['flowers'] = fl;

      // sapateira 3D Kenney + sapatos
      b.glb('sideTableDrawers', 6.4, 0, -2.5, { rotY: -Math.PI / 2, targetW: 2.0, targetH: 1.2, targetD: 1.0, collide: true });
      const s1 = b.pivot('shoes1', 3.0, 0, 3.2);
      b.box(0.22, 0.15, 0.5, 0xef4444, -0.18, 0, 0, false, s1);
      b.box(0.22, 0.15, 0.5, 0xef4444, 0.18, 0, 0, false, s1);
      const s2 = b.pivot('shoes2', 4.4, 0, 3.5);
      s2.rotation.y = 0.6;
      b.box(0.22, 0.15, 0.5, 0x3b82f6, -0.18, 0, 0, false, s2);
      b.box(0.22, 0.15, 0.5, 0x3b82f6, 0.18, 0, 0, false, s2);

      // caixa de brinquedos 3D Kenney + brinquedos
      const tb = b.pivot('toybox', -6.1, 0, 2.0);
      b.glb('cardboardBoxOpen', 0, 0, 0, { targetW: 1.4, targetH: 0.8, targetD: 1.2, parent: tb });
      b.col(-6.8, -5.4, 1.4, 2.6);
      const t1 = b.pivot('toy1', -2.5, 0, 1.0);
      b.box(0.4, 0.4, 0.4, 0xef4444, 0, 0, 0, false, t1);
      const t2 = b.pivot('toy2', -3.4, 0, 3.4);
      b.sph(0.25, 0x3b82f6, 0, 0.25, 0, t2);
      const t3 = b.pivot('toy3', -1.2, 0, 3.0);
      b.cyl(0.2, 0.5, 0xfacc15, 0, 0, 0, false, t3);
      b.sph(0.15, 0xec4899, 0, 0.55, 0, t3);

      b.glb('rugRound', 0, 0, 0.5, { targetW: 5.0, targetH: 0.04, targetD: 5.0 });
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
      // estante 3D Kenney com o livro da história
      b.glb('bookcaseOpen', -1.2, 0, -4.3, { targetW: 2.0, targetH: 3.0, targetD: 1.0, collide: true });
      b.glb('books', -1.5, 2.15, -4.2, { targetW: 0.8, targetH: 0.45, targetD: 0.45 });
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
      // 3 prateleiras com produtos 3D Kenney
      const shelfDecor = [
        ['croissant', 'cookie', 'cupcake', 'loaf-round', 'muffin'],
        ['bottle-ketchup', 'bottle-musterd', 'can', 'carton-small', 'bottle-oil'],
        ['apple', 'banana', 'pear', 'strawberry', 'pineapple'],
      ];
      [ -4.5, 0, 4.5 ].forEach((x, idx) => {
        b.box(3, 2.4, 0.9, 0x94a3b8, x, 0, -4.3, true);
        for (const y of [0.6, 1.3, 2.0]) {
          b.box(2.9, 0.05, 0.5, 0xe2e8f0, x, y, -3.85);
          if (y !== 1.3) {
            for (let i = 0; i < 5; i++) {
              const item = shelfDecor[idx][(i + Math.round(y)) % 5];
              b.glb(item, x - 1.2 + i * 0.6, y + 0.05, -3.85, { folder: 'food', targetW: 0.34, targetH: 0.34, targetD: 0.34 });
            }
          }
        }
      });

      const bread = b.pivot('bread', -4.5, 1.35, -3.75);
      b.glb('loaf', 0, 0, 0, { folder: 'food', targetW: 0.62, targetH: 0.32, targetD: 0.34, parent: bread });

      const milk = b.pivot('milk', 0, 1.35, -3.75);
      b.glb('carton', 0, 0, 0, { folder: 'food', targetW: 0.3, targetH: 0.58, targetD: 0.3, parent: milk });

      const fruit = b.pivot('fruit', 4.5, 1.35, -3.75);
      b.box(0.6, 0.12, 0.4, 0x92400e, 0, 0, 0, false, fruit);
      for (const [fx, fz] of [[-0.16, 0], [0.16, 0.05], [0, -0.08]]) {
        b.glb('orange', fx, 0.12, fz, { folder: 'food', targetW: 0.24, targetH: 0.24, targetD: 0.24, parent: fruit });
      }

      // carrinho
      const cart = b.pivot('cart', -1.5, 0, 1.0);
      b.box(0.9, 0.08, 0.6, 0x94a3b8, 0, 0.4, 0, false, cart);
      b.box(0.9, 0.35, 0.04, 0x64748b, 0, 0.45, 0.3, false, cart);
      b.box(0.9, 0.35, 0.04, 0x64748b, 0, 0.45, -0.3, false, cart);
      b.box(0.04, 0.35, 0.6, 0x64748b, 0.45, 0.45, 0, false, cart);
      b.box(0.04, 0.35, 0.6, 0x64748b, -0.45, 0.45, 0, false, cart);
      b.box(0.04, 0.5, 0.6, 0x475569, 0.45, 0.8, 0, false, cart);
      for (const [wx, wz] of [[-0.35, -0.22], [0.35, -0.22], [-0.35, 0.22], [0.35, 0.22]]) b.sph(0.07, 0x111827, wx, 0.07, wz, cart);

      // caixa 3D Kenney, caixa (pessoa) e sacola 3D
      b.glb('kitchenBar', 5.0, 0, -0.5, { targetW: 2.2, targetH: 1.0, targetD: 1.0, collide: true });
      b.box(0.5, 0.3, 0.4, 0x1f2937, 5.6, 1.0, -0.5);
      b.npc('cashier', 'menina', 5.0, -1.7, 0, { top: 0x16a34a, pants: 0x1e293b });
      const bag = b.pivot('bag', 4.2, 1.0, -0.5);
      b.glb('bag', 0, 0, 0, { folder: 'food', targetW: 0.48, targetH: 0.58, targetD: 0.32, parent: bag });
      bag.visible = false;
      b.glb('rugRound', -1, 0, 1.8, { targetW: 3.6, targetH: 0.04, targetD: 3.6 });
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
      // dentista 3D articulado (jaleco branco)
      b.npc('dentist', 'menino', -1.3, -2.6, Math.PI / 2, { top: 0xf8fafc, pants: 0x0284c7 });
      // bandeja 3D Kenney com ferramentas
      b.glb('sideTable', -2.4, 0, -4.2, { targetW: 0.9, targetH: 1.0, targetD: 0.7, collide: true });
      b.box(0.3, 0.04, 0.04, 0x94a3b8, -2.5, 1.0, -4.2);
      b.box(0.04, 0.04, 0.3, 0x94a3b8, -2.2, 1.0, -4.2);
      // pia 3D Kenney e copo 3D para enxaguar
      b.glb('bathroomSink', 4.2, 0, -4.4, { targetW: 1.6, targetH: 1.35, targetD: 0.9, collide: true });
      b.props['cup'] = b.glb('cup', 3.6, 1.0, -4.4, { folder: 'food', targetW: 0.22, targetH: 0.26, targetD: 0.22 });
      // cartaz do dente, planta e estante de adesivos
      const tooth = emojiSprite('🦷', 1.4);
      tooth.position.set(1.5, 2.6, -4.9);
      b.group.add(tooth);
      b.glb('pottedPlant', 6.1, 0, -4.3, { targetW: 0.9, targetH: 1.3, targetD: 0.9, collide: true });
      b.box(0.1, 1.2, 2.4, 0xfde68a, -6.85, 1.0, -1.8);
      ['⭐', '🦄', '🚀'].forEach((e, i) => {
        const sp = emojiSprite(e, 0.55);
        sp.position.set(-6.7, 1.6, -2.5 + i * 0.7);
        b.group.add(sp);
        b.props['stk' + i] = sp;
      });
      b.glb('rugRectangle', -4.6, 0, -1.8, { targetW: 2.2, targetH: 0.04, targetD: 1.4 });
    },
  },
];
