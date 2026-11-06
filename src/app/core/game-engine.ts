import { Injectable, NgZone } from '@angular/core';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoutineService } from './routine.service';
import { ROOMS, ROOM_D, ROOM_W, Collider, buildRoom } from '../scenes/rooms';

export type CharacterType = 'menino' | 'menina' | 'cachorro' | 'gato' | 'coelho' | 'panda';
type AnimName = 'idle' | 'walk' | 'run';
type OutfitPart = 'hair' | 'top' | 'pants' | 'shoes';

const WALK_SPEED = 3.5; // unidades por segundo
const RUN_SPEED = 6.5;
const PLAYER_RADIUS = 0.45;
const INTERACT_RADIUS = 1.1; // distância até o ponto para contar
const DWELL_TIME = 0.7; // segundos parado no ponto para concluir a etapa
const ROOM_CHANGE_DELAY = 2600; // ms de comemoração antes de trocar de sala

// Palavras para achar as animações pelo nome, mesmo que o pacote use variações
const ANIM_PATTERNS: Record<AnimName, RegExp[]> = {
  idle: [/^idle$/i, /idle/i, /stand/i],
  walk: [/^walk$/i, /walk/i],
  run: [/^run$/i, /run/i, /sprint/i, /jog/i],
};

// Palavras para achar cada peça pelo NOME DO MATERIAL
const MATERIAL_KEYWORDS: Record<OutfitPart, string[]> = {
  hair: ['hair', 'cabelo'],
  top: ['shirt', 'top', 'jacket', 'hoodie', 'torso', 'cloth', 'sweater', 'coat', 'blouse'],
  pants: ['pant', 'trouser', 'short', 'skirt', 'bottom', 'jean', 'leg'],
  shoes: ['shoe', 'boot', 'feet', 'foot', 'sneaker'],
};

// Se o material não casar, tenta pelo NOME DA MALHA (os pacotes "Modular" dividem em Head/Body/Legs/Feet)
const MESH_KEYWORDS: Record<OutfitPart, string[]> = {
  hair: ['hair'],
  top: ['body', 'torso', 'chest'],
  pants: ['legs', 'pants'],
  shoes: ['feet', 'shoes', 'boots'],
};

// Materiais que nunca são recoloridos (pele, olhos, rosto)
const PROTECTED = /skin|eye|face|mouth|teeth|brow|lip/i;

// Cores em 0xRRGGBB. Visual de princesa e príncipe.
const OUTFITS: Partial<Record<CharacterType, Partial<Record<OutfitPart, number>>>> = {
  menina: { hair: 0xfde68a, top: 0xf9a8d4, pants: 0xfbcfe8, shoes: 0xfacc15 },
  menino: { hair: 0x78350f, top: 0x1d4ed8, pants: 0xf1f5f9, shoes: 0x3f2a14 },
};

// Acessórios criados por código (tamanhos são proporcionais à altura do personagem)
const ROYAL: Partial<Record<CharacterType, { crown: number; skirt?: number; cape?: number }>> = {
  menina: { crown: 0xfacc15, skirt: 0xf472b6 },
  menino: { crown: 0xfacc15, cape: 0xdc2626 },
};

@Injectable({ providedIn: 'root' })
export class GameEngineService {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private root = new THREE.Group();
  private model?: THREE.Object3D;

  private mixer?: THREE.AnimationMixer;
  private actions: Partial<Record<AnimName, THREE.AnimationAction>> = {};
  private currentAnim?: AnimName;

  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private keys: Record<string, boolean> = {};
  private joy = { x: 0, y: 0 };
  private currentCharacter: CharacterType = 'menino';
  private loadToken = 0;

  private isMoving = false;
  private isRunning = false;
  private petCycle = 0;
  private idleCycle = 0;
  private camTarget = new THREE.Vector3();
  private camSnap = true;

  // Casa / rotina
  private roomGroup?: THREE.Group;
  private colliders: Collider[] = [];
  private marker = new THREE.Group();
  private markerArrow!: THREE.Mesh;
  private markerRing!: THREE.Mesh;
  private markerFill!: THREE.Mesh;
  private markerT = 0;
  private dwell = 0;

  private onKeyDown = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = true);
  private onKeyUp = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = false);
  private onResizeBound = () => this.onResize();

  constructor(private ngZone: NgZone, private routine: RoutineService) {}

  public initEngine(canvas: HTMLCanvasElement): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResizeBound);

    // Luzes e chão externo (fixos, não mudam entre as salas)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(6, 16, 9);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const sc = dir.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.far = 60;
    this.scene.add(dir);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    this.scene.add(ground);

    this.scene.add(this.root);
    this.buildMarker();
    this.scene.add(this.marker);

    this.loadRoom(this.routine.roomIndex());
    this.loadCharacter(this.currentCharacter);
    this.ngZone.runOutsideAngular(() => this.gameLoop());
  }

  public selectCharacter(type: CharacterType): void {
    if (this.currentCharacter === type && this.model) return;
    this.currentCharacter = type;
    this.loadCharacter(type);
  }

  /** Entrada do joystick virtual: x e y de -1 a 1 (y positivo = para baixo na tela) */
  public setJoystick(x: number, y: number): void {
    this.joy.x = x;
    this.joy.y = y;
  }

  public loadRoom(index: number): void {
    if (this.roomGroup) {
      this.scene.remove(this.roomGroup);
      this.disposeGroup(this.roomGroup);
    }
    const built = buildRoom(ROOMS[index]);
    this.roomGroup = built.group;
    this.colliders = built.colliders;
    this.scene.add(built.group);

    this.root.position.set(0, 0, 3.4);
    this.root.rotation.y = Math.PI; // de frente para a parede de fundo
    this.dwell = 0;
    this.camSnap = true;
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
  }

  // ---------------------------------------------------------------- MARCADOR DA ETAPA

  private buildMarker(): void {
    const mat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });

    const bg = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), mat(0xfacc15, 0.25));
    bg.rotation.x = -Math.PI / 2;

    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), mat(0xfacc15, 0.95));
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 0.01;

    this.markerFill = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), mat(0x4ade80, 0.6));
    this.markerFill.rotation.x = -Math.PI / 2;
    this.markerFill.position.y = 0.02;
    this.markerFill.scale.setScalar(0.001);

    this.markerArrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), mat(0xfacc15, 1));
    this.markerArrow.rotation.x = Math.PI; // ponta para baixo

    this.marker.add(bg, this.markerRing, this.markerFill, this.markerArrow);
    this.marker.visible = false;
  }

  private updateRoutine(dt: number): void {
    const step = this.routine.now();
    const show = !!step && !this.routine.roomDone();
    this.marker.visible = show;
    if (!show || !step) return;

    this.marker.position.set(step.x, 0.08, step.z);
    this.markerT += dt;
    this.markerArrow.position.y = 2.3 + Math.sin(this.markerT * 4) * 0.2;
    this.markerRing.scale.setScalar(1 + Math.sin(this.markerT * 5) * 0.06);

    const dist = Math.hypot(this.root.position.x - step.x, this.root.position.z - step.z);
    if (dist < INTERACT_RADIUS) this.dwell = Math.min(DWELL_TIME, this.dwell + dt);
    else this.dwell = Math.max(0, this.dwell - dt * 2);

    this.markerFill.scale.setScalar(Math.max(0.001, this.dwell / DWELL_TIME));

    if (this.dwell >= DWELL_TIME) {
      this.dwell = 0;
      // A rotina usa signals lidos pelo HUD: atualiza dentro da zona do Angular
      this.ngZone.run(() => {
        const roomFinished = this.routine.completeStep();
        if (roomFinished) {
          setTimeout(() => {
            this.ngZone.run(() => {
              this.routine.advanceRoom();
              this.loadRoom(this.routine.roomIndex());
            });
          }, ROOM_CHANGE_DELAY);
        }
      });
    }
  }

  // ---------------------------------------------------------------- CARREGAMENTO

  private isHuman(t: CharacterType = this.currentCharacter): boolean {
    return t === 'menino' || t === 'menina';
  }

  private async loadCharacter(type: CharacterType): Promise<void> {
    const token = ++this.loadToken;

    if (this.model) this.root.remove(this.model);
    this.mixer?.stopAllAction();
    this.mixer = undefined;
    this.actions = {};
    this.currentAnim = undefined;
    this.model = undefined;

    try {
      if (this.isHuman(type)) {
        // Humanos: Quaternius .gltf (animações já vêm dentro do arquivo)
        const gltf = await new GLTFLoader().loadAsync(`assets/models/${type}.gltf`);
        if (token !== this.loadToken) return;

        const model = gltf.scene;
        this.prepareMeshes(model);
        this.applyOutfit(model, type);

        this.model = model;
        this.root.add(model);

        this.addRoyalAccessories(model, type); // depois de entrar na cena, antes das animações

        console.info(
          `[${type}] animações no arquivo:`,
          gltf.animations.map((a) => a.name)
        );
        this.setupClips(model, gltf.animations);
      } else {
        // Pets: modelo FBX estático (animação procedural)
        const fbx = await new FBXLoader().loadAsync(`assets/models/${type}.fbx`);
        if (token !== this.loadToken) return;

        fbx.scale.setScalar(0.004);
        this.prepareMeshes(fbx);
        this.model = fbx;
        this.root.add(fbx);
      }
    } catch (err) {
      console.warn(`Erro ao carregar ${type}:`, err);
    }
  }

  private prepareMeshes(obj: THREE.Object3D): void {
    obj.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // evita o personagem "sumir" ao animar
      }
    });
  }

  // ---------------------------------------------------------------- ROUPAS

  private applyOutfit(model: THREE.Object3D, type: CharacterType): void {
    const outfit = OUTFITS[type];
    if (!outfit) return;

    const log: string[] = [];
    const matched: string[] = [];
    const parts = Object.keys(MATERIAL_KEYWORDS) as OutfitPart[];

    model.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isArray = Array.isArray(mesh.material);
      const mats = (isArray ? mesh.material : [mesh.material]) as THREE.Material[];
      const meshName = mesh.name.toLowerCase();

      const recolored = mats.map((mat) => {
        const matName = mat.name.toLowerCase();
        log.push(`malha "${mesh.name}" / material "${mat.name}"`);
        if (PROTECTED.test(matName)) return mat;

        let part = parts.find((p) => outfit[p] !== undefined && MATERIAL_KEYWORDS[p].some((k) => matName.includes(k)));
        if (!part) {
          part = parts.find((p) => outfit[p] !== undefined && MESH_KEYWORDS[p].some((k) => meshName.includes(k)));
        }
        if (!part) return mat;

        const copy = mat.clone() as THREE.MeshStandardMaterial; // clone: não afeta outros modelos
        if (!copy.color) return mat;
        copy.color.setHex(outfit[part] as number);
        matched.push(`"${mesh.name}"/"${mat.name}" → ${part}`);
        return copy;
      });

      mesh.material = isArray ? recolored : recolored[0];
    });

    console.info(`[${type}] malhas e materiais no arquivo:`, log);
    console.info(`[${type}] recoloridos:`, matched);
    if (!matched.length) console.warn(`[${type}] nada foi recolorido. Me envie as linhas acima.`);
  }

  private findBone(model: THREE.Object3D, patterns: RegExp[], exclude?: RegExp): THREE.Object3D {
    const bones: THREE.Object3D[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o);
    });
    for (const p of patterns) {
      const found = bones.find((b) => p.test(b.name) && !(exclude && exclude.test(b.name)));
      if (found) return found;
    }
    return model; // sem osso: fica fixo no modelo
  }

  // Prende um objeto a um osso, mantendo a posição de mundo e a orientação "em pé"
  private attachToBone(obj: THREE.Object3D, bone: THREE.Object3D, worldPos: THREE.Vector3): void {
    bone.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    bone.getWorldQuaternion(q);
    bone.getWorldScale(s);

    obj.position.copy(bone.worldToLocal(worldPos.clone()));
    obj.quaternion.copy(q.invert());
    obj.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    bone.add(obj);
  }

  // Coroa (todos), saia (menina) e capa (menino)
  private addRoyalAccessories(model: THREE.Object3D, type: CharacterType): void {
    const style = ROYAL[type];
    if (!style) return;

    // Calcula tudo com o personagem virado para frente (rotação zerada) e restaura depois
    const savedRot = this.root.rotation.y;
    this.root.rotation.y = 0;
    this.root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model, true);
    const H = box.max.y - box.min.y;
    if (!isFinite(H) || H <= 0) {
      this.root.rotation.y = savedRot;
      return;
    }
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const y = (k: number) => box.min.y + H * k;

    const bones: string[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o.name);
    });
    console.info(`[${type}] ossos:`, bones);

    // --- Coroa
    const gold = new THREE.MeshStandardMaterial({ color: style.crown, metalness: 0.3, roughness: 0.4 });
    const crown = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * H, 0.075 * H, 0.035 * H, 16, 1, true), gold);
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    crown.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014 * H, 0.05 * H, 8), gold);
      spike.position.set(Math.cos(a) * 0.075 * H, 0.04 * H, Math.sin(a) * 0.075 * H);
      crown.add(spike);
    }
    const head = this.findBone(model, [/^head$/i, /head/i], /top|end|tip/i);
    this.attachToBone(crown, head, new THREE.Vector3(cx, box.max.y - 0.005 * H, cz));

    // --- Saia (princesa)
    if (style.skirt !== undefined) {
      const skirtH = 0.3 * H;
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * H, 0.23 * H, skirtH, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: style.skirt, roughness: 0.7, side: THREE.DoubleSide })
      );
      const hips = this.findBone(model, [/hips/i, /pelvis/i]);
      this.attachToBone(skirt, hips, new THREE.Vector3(cx, y(0.54) - skirtH / 2, cz));
    }

    // --- Capa (príncipe): fica nas costas (-Z, o personagem olha para +Z)
    if (style.cape !== undefined) {
      const capeH = 0.42 * H;
      const cape = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 * H, capeH, 0.012 * H),
        new THREE.MeshStandardMaterial({ color: style.cape, roughness: 0.8 })
      );
      const chest = this.findBone(model, [/upperchest/i, /chest/i, /spine2/i, /torso/i, /spine/i]);
      this.attachToBone(cape, chest, new THREE.Vector3(cx, y(0.79) - capeH / 2, cz - 0.075 * H));
    }

    this.root.rotation.y = savedRot;
    this.root.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- ANIMAÇÕES

  private setupClips(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (!clips.length) {
      console.warn('Este arquivo não tem animações.');
      return;
    }
    this.mixer = new THREE.AnimationMixer(model);

    (Object.keys(ANIM_PATTERNS) as AnimName[]).forEach((name) => {
      const clip = this.findClip(clips, ANIM_PATTERNS[name], name);
      if (clip) {
        this.actions[name] = this.mixer!.clipAction(clip);
      } else {
        console.warn(`Animação "${name}" não encontrada. Ajuste ANIM_PATTERNS.`);
      }
    });

    // Passo um pouco mais rápido e vivo (estilo Roblox)
    if (this.actions.walk) this.actions.walk.timeScale = 1.2;
    if (this.actions.run) this.actions.run.timeScale = 1.1;

    this.playAnim('idle');
  }

  private findClip(clips: THREE.AnimationClip[], patterns: RegExp[], name: AnimName) {
    for (const p of patterns) {
      const found = clips.find((c) => {
        if (!p.test(c.name)) return false;
        if (name === 'walk' && /run|sprint/i.test(c.name)) return false; // "walk" não pega "run"
        return true;
      });
      if (found) return found;
    }
    return undefined;
  }

  private playAnim(name: AnimName): void {
    if (this.currentAnim === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.currentAnim ? this.actions[this.currentAnim] : undefined;

    next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    this.currentAnim = name;
  }

  // ---------------------------------------------------------------- LOOP

  private gameLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.updateMovement(dt);
    this.resolveCollisions();
    this.updateRoutine(dt);

    if (this.isHuman()) {
      this.playAnim(!this.isMoving ? 'idle' : this.isRunning ? 'run' : 'walk');
      this.mixer?.update(dt);
      this.animateHumanExtras(dt);
    } else {
      this.animatePet(dt);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateMovement(dt: number): void {
    let mx = 0;
    let mz = 0;
    let analog = 1;

    const joyMag = Math.hypot(this.joy.x, this.joy.y);
    if (joyMag > 0.15) {
      // Joystick virtual (celular)
      mx = this.joy.x;
      mz = this.joy.y;
      this.isRunning = joyMag > 0.92; // empurrar até o fim = correr
      analog = 1;
    } else {
      if (this.keys['w'] || this.keys['arrowup']) mz -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) mz += 1;
      if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) mx += 1;
      this.isRunning = !!this.keys['shift'];
    }

    this.isMoving = mx !== 0 || mz !== 0;
    if (!this.isMoving) return;

    const len = Math.hypot(mx, mz); // diagonal não fica mais rápida
    mx /= len;
    mz /= len;

    const speed = (this.isRunning ? RUN_SPEED : WALK_SPEED) * analog * dt;
    this.root.position.x += mx * speed;
    this.root.position.z += mz * speed;

    const target = Math.atan2(mx, mz);
    let diff = target - this.root.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.root.rotation.y += diff * (1 - Math.exp(-14 * dt));
  }

  // Limites da sala + móveis (círculo do personagem contra retângulos)
  private resolveCollisions(): void {
    const p = this.root.position;
    const r = PLAYER_RADIUS;
    p.x = Math.min(ROOM_W / 2 - 0.7, Math.max(-ROOM_W / 2 + 0.7, p.x));
    p.z = Math.min(ROOM_D / 2 - 0.7, Math.max(-ROOM_D / 2 + 0.7, p.z));

    for (const c of this.colliders) {
      const nx = Math.min(c[1], Math.max(c[0], p.x));
      const nz = Math.min(c[3], Math.max(c[2], p.z));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;

      if (d > 0.0001) {
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // centro dentro do móvel: empurra pela face mais próxima
        const l = p.x - c[0];
        const rt = c[1] - p.x;
        const f = p.z - c[2];
        const b = c[3] - p.z;
        const m = Math.min(l, rt, f, b);
        if (m === l) p.x = c[0] - r;
        else if (m === rt) p.x = c[1] + r;
        else if (m === f) p.z = c[2] - r;
        else p.z = c[3] + r;
      }
    }
  }

  // Toque "Roblox" por cima da animação do pacote: inclinação pra frente e quique
  private animateHumanExtras(dt: number): void {
    const m = this.model;
    if (!m) return;

    if (this.isMoving) {
      this.petCycle += dt * (this.isRunning ? 14 : 9);
      const lean = this.isRunning ? 0.14 : 0.06;
      m.rotation.x += (lean - m.rotation.x) * (1 - Math.exp(-10 * dt));
      m.position.y = Math.abs(Math.sin(this.petCycle)) * (this.isRunning ? 0.08 : 0.04);
    } else {
      m.rotation.x += (0 - m.rotation.x) * (1 - Math.exp(-10 * dt));
      m.position.y += (0 - m.position.y) * (1 - Math.exp(-10 * dt));
    }
  }

  // Pets (malha estática): pulinho, balanço e squash
  private animatePet(dt: number): void {
    const m = this.model;
    if (!m) return;
    const base = 0.004;

    if (this.isMoving) {
      this.idleCycle = 0;
      this.petCycle += dt * (this.isRunning ? 16 : 11);
      const hop = Math.abs(Math.sin(this.petCycle));
      const sway = Math.sin(this.petCycle);

      m.position.y = hop * (this.isRunning ? 0.28 : 0.16);
      m.rotation.z = sway * 0.12;
      m.rotation.x = this.isRunning ? 0.15 : 0.07;
      const squash = 1 - hop * 0.05;
      m.scale.set(base * (2 - squash), base * squash, base * (2 - squash));
    } else {
      this.petCycle = 0;
      this.idleCycle += dt * 2.2;
      const breath = Math.sin(this.idleCycle);
      m.position.y = 0;
      m.rotation.z *= 0.85;
      m.rotation.x *= 0.85;
      m.rotation.y = Math.sin(this.idleCycle * 0.4) * 0.12;
      m.scale.set(base, base * (1 + breath * 0.015), base);
    }
  }

  private updateCamera(dt: number): void {
    const p = this.root.position;
    this.camTarget.set(p.x, p.y + 3.8, p.z + 6.8);
    if (this.camSnap) {
      this.camera.position.copy(this.camTarget); // sem "voar" ao trocar de sala
      this.camSnap = false;
    } else {
      this.camera.position.lerp(this.camTarget, 1 - Math.exp(-8 * dt));
    }
    this.camera.lookAt(p.x, p.y + 1.0, p.z);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResizeBound);
    this.renderer?.dispose();
  }
}