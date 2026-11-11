import { Injectable, NgZone, signal } from '@angular/core';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoutineService } from './routine.service';
import { AudioService } from './audio.service';
import { VoiceService } from './voice.service';
import { ProgressService } from './progress.service';
import { ROOMS, ROOM_D, ROOM_W, Collider, StepDef, buildRoom } from '../scenes/rooms';
import { ACTIONS } from '../scenes/actions';
import type { Action, ActionCtx, Pose } from '../scenes/action-kit';
import { Fx } from '../scenes/fx';

export type CharacterType = 'menino' | 'menina' | 'cachorro' | 'gato' | 'coelho' | 'panda';
export type PetType = Exclude<CharacterType, 'menino' | 'menina'>;
type AnimName = 'idle' | 'walk' | 'run';
type OutfitPart = 'hair' | 'top' | 'pants' | 'shoes';

const WALK_SPEED = 3.5; // unidades por segundo
const RUN_SPEED = 6.5;
const PLAYER_RADIUS = 0.45;
const PET_RADIUS = 0.35;
const INTERACT_RADIUS = 1.0; // distância até o ponto para iniciar a ação
const ROOM_CHANGE_DELAY = 4200; // ms de comemoração antes de trocar de sala
const PRAISES = ['Muito bem, {nome}!', 'Isso aí, {nome}!', 'Parabéns, {nome}!', 'Você conseguiu, {nome}!', 'Que legal, {nome}!'];
const DAY_COMPLETE_DELAY = 6500;

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

interface ArmRig {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  a: number; // comprimento do braço
  b: number; // comprimento do antebraço
}

interface Pet {
  controlled?: boolean; // uma ação está no comando (ex.: buscar a bola)
  type: PetType;
  root: THREE.Group;
  model?: THREE.Object3D;
  cycle: number;
  idle: number;
  moving: boolean;
  fast: boolean;
}

interface ActiveAction {
  idx: number; // índice da etapa na fase
  demo: boolean; // o personagem está mostrando como faz
  step: StepDef;
  action: Action;
  ctx: ActionCtx;
  t: number;
}

@Injectable({ providedIn: 'root' })
export class GameEngineService {
  /** Pets que acompanham o personagem (toque nos botões para chamar/dispensar) */
  readonly activePets = signal<PetType[]>(['cachorro']);

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private root = new THREE.Group();
  private model?: THREE.Object3D;
  private charH = 1.8;
  private topMats: THREE.MeshStandardMaterial[] = [];

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
  private inputActive = false;
  private petCycle = 0;
  private heading = Math.PI;
  private camTarget = new THREE.Vector3();
  private camSnap = true;

  // Casa / rotina
  private roomGroup?: THREE.Group;
  private colliders: Collider[] = [];
  private props: Record<string, THREE.Object3D> = {};
  private marker = new THREE.Group();
  private markerArrow!: THREE.Mesh;
  private markerRing!: THREE.Mesh;
  private markerT = 0;

  // Ações
  private fx = new Fx();
  private act?: ActiveAction;
  private sleeping = false;
  private held?: THREE.Object3D;
  private pack?: THREE.Object3D;
  private pose: Pose = { y: 0, lean: 0, sway: 0, stretch: 0, lie: 0 };
  private lastProgress = -1;

  // Braços (cinemática inversa) e fala
  private arms: { l?: ArmRig; r?: ArmRig } = {};
  private handReq: { l?: { p: THREE.Vector3; w: number }; r?: { p: THREE.Vector3; w: number } } = {};
  private handState = { l: { w: 0, p: new THREE.Vector3() }, r: { w: 0, p: new THREE.Vector3() } };
  private boundW = ROOM_W;
  private boundD = ROOM_D;
  private camOff: [number, number] = [3.8, 6.8];
  private idleT = 0;
  private reminders = 0;
  private lastStepKey = '';

  // Luzes, trava, marcadores, guia e "Mostre-me"
  private lights?: { amb: THREE.AmbientLight; hemi: THREE.HemisphereLight; dir: THREE.DirectionalLight };
  private locked = false;
  private markers: { g: THREE.Group; arrow: THREE.Mesh; ring: THREE.Mesh }[] = [];
  private guide: THREE.Mesh[] = [];
  private demoStep?: { step: StepDef; idx: number; t: number };
  private wakeLock?: { release(): Promise<void> };

  // Pets
  private pets = new Map<PetType, Pet>();
  private cheer = 0;

  private onKeyDown = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = true);
  private onKeyUp = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = false);
  private onResizeBound = () => this.onResize();
  private unlockAudio = () => {
    this.audio.unlock();
    // iPhone/Android: o som só libera depois de um toque; mantém até o áudio realmente rodar
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.removeEventListener(ev, this.unlockAudio);
  };
  private onVisibility = () => {
    if (document.hidden) {
      this.voice.cancel();
      this.audio.stopMusic();
    } else if (this.audio.musicOn()) {
      this.audio.unlock();
    }
  };

  constructor(
    private ngZone: NgZone,
    private routine: RoutineService,
    private audio: AudioService,
    private voice: VoiceService,
    private progress: ProgressService
  ) {}

  public initEngine(canvas: HTMLCanvasElement): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResizeBound);
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, this.unlockAudio);
    window.addEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.addEventListener('resize', this.onResizeBound);
    document.addEventListener('visibilitychange', this.onVisibility);

    // Luzes e chão externo (fixos, não mudam entre as salas)
    const amb = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(6, 16, 9);
    dir.castShadow = true;
    dir.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024);
    const sc = dir.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.far = 60;
    this.scene.add(dir);
    this.lights = { amb, hemi, dir };

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    this.scene.add(ground);

    // YXZ: o "girar" fica por fora, então inclinar/deitar funciona em qualquer direção
    this.root.rotation.order = 'YXZ';
    this.scene.add(this.root);
    this.scene.add(this.fx.group);
    this.buildGuide();
    this.applySettings();

    const prof = this.progress.profile();
    this.currentCharacter = prof.avatar;
    this.activePets.set((prof.pets as PetType[]).filter((t) => ['cachorro', 'gato', 'coelho', 'panda'].includes(t)));
    this.loadRoom(this.routine.roomIndex());
    this.loadCharacter(this.currentCharacter);
    this.activePets().forEach((t) => this.spawnPet(t));
    this.ngZone.runOutsideAngular(() => this.gameLoop());
  }

  /** Menino/Menina trocam o personagem. Os bichos entram e saem como companheiros. */
  public selectCharacter(type: CharacterType): void {
    if (type !== 'menino' && type !== 'menina') {
      this.togglePet(type);
      return;
    }
    if (this.currentCharacter === type && this.model) return;
    this.currentCharacter = type;
    this.loadCharacter(type);
  }

  /** Chamado pelo botão "Começar" da tela inicial: libera som/voz e abre o mapa de fases */
  public begin(): void {
    this.applySettings();
    this.audio.unlock();
    void this.keepAwake();
    this.routine.screen.set('map');
    this.voice.speak(this.fmt('Oi, {nome}! Escolha uma fase para jogar.'));
  }

  /** Mapa -> escolhe uma fase */
  public startLevel(index: number): void {
    this.routine.enter(index);
    this.loadRoom(index);
    if (ROOMS[index].story.length) this.routine.screen.set('story');
    else this.playLevel();
  }

  /** História social lida -> começa a fase */
  public playLevel(): void {
    this.routine.screen.set('play');
    this.idleT = 0;
    this.reminders = 0;
    const def = this.routine.room();
    this.voice.speak(this.fmt(def.intro + ' ') + this.stepText());
  }

  /** Sai da fase e volta ao mapa */
  public goMap(): void {
    this.voice.cancel();
    this.audio.water(false);
    this.routine.screen.set('map');
  }

  /** Aplica os ajustes salvos (som, voz, qualidade, movimento calmo) */
  public applySettings(): void {
    const st = this.progress.settings();
    this.audio.musicOn.set(st.music);
    this.audio.sfxOn.set(st.sfx);
    this.voice.enabled.set(st.voice);
    this.fx.calm = st.calmMotion;
    this.setTopColor(st.topColor);
    if (this.renderer) {
      this.renderer.setPixelRatio(this.pixelRatio());
      if (this.lights) this.lights.dir.castShadow = st.quality !== 'leve';
    }
    if (!st.music) this.audio.stopMusic();
  }

  private pixelRatio(): number {
    const q = this.progress.settings().quality;
    const base = Math.min(window.devicePixelRatio || 1, 2);
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return q === 'leve' ? 1 : q === 'alta' ? base : coarse ? Math.min(base, 1.5) : base;
  }

  private setTopColor(hex: number): void {
    if (!hex) return; // 0 = cor padrão do personagem
    this.topMats.forEach((m) => m.color.setHex(hex));
  }

  private async keepAwake(): Promise<void> {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !this.wakeLock) this.wakeLock = await wl.request('screen'); // a tela não apaga durante o jogo
    } catch {
      /* sem suporte: tudo bem */
    }
  }

  /** "Mostre-me": o personagem faz a etapa sozinho para a criança aprender vendo (modelagem por vídeo) */
  public demo(): void {
    if (!this.routine.started() || this.act || this.demoStep || this.routine.roomDone()) return;
    const cands = this.routine.candidates();
    if (!cands.length) return;
    const steps = this.routine.room().steps;
    let idx = cands[0];
    let best = Infinity;
    for (const i of cands) {
      const d = Math.hypot(this.root.position.x - steps[i].x, this.root.position.z - steps[i].z);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    this.routine.helps.update((v) => v + 1);
    this.demoStep = { step: steps[idx], idx, t: 0 };
    this.voice.speak('Olhe como eu faço.');
  }

  /** Botão "ouvir de novo" */
  public repeatInstruction(): void {
    this.speakStep('');
  }

  private fmt(t: string): string {
    return t.replace(/\{nome\}/g, this.routine.childName() || 'amiguinho');
  }

  private stepText(): string {
    const step = this.routine.now();
    if (step) return this.fmt(step.say);
    return this.routine.candidates().length ? 'Escolha o que você quer fazer primeiro.' : '';
  }

  private speakStep(prefix: string): void {
    const t = this.stepText();
    if (t) this.voice.speak(prefix + t);
  }

  public togglePet(type: PetType): void {
    const list = this.activePets();
    if (list.includes(type)) {
      const pet = this.pets.get(type);
      if (pet) this.scene.remove(pet.root);
      this.pets.delete(type);
      this.activePets.set(list.filter((t) => t !== type));
    } else {
      this.activePets.set([...list, type]);
      this.spawnPet(type);
    }
    this.audio.sfx('pop');
  }

  /** Entrada do joystick virtual: x e y de -1 a 1 (y positivo = para baixo na tela) */
  public setJoystick(x: number, y: number): void {
    this.joy.x = x;
    this.joy.y = y;
  }

  // ---------------------------------------------------------------- SALAS

  public loadRoom(index: number): void {
    if (this.roomGroup) {
      this.scene.remove(this.roomGroup);
      this.disposeGroup(this.roomGroup);
    }
    this.fx.clear();
    this.act = undefined;
    this.locked = false;
    this.demoStep = undefined;
    this.discardHeld();
    this.resetPose();
    this.audio.water(false);

    const def = ROOMS[index];
    this.setLightFactor(def.night ? 0.55 : 1);
    (this.scene.background as THREE.Color).setHex(def.sky);
    this.boundW = def.w ?? ROOM_W;
    this.boundD = def.d ?? ROOM_D;
    this.camOff = def.cam ?? [3.8, 6.8];
    const built = buildRoom(def);
    this.roomGroup = built.group;
    this.colliders = built.colliders;
    this.props = built.props;
    this.scene.add(built.group);

    if (index === 0 && this.pack) {
      this.root.remove(this.pack); // novo dia: mochila volta para o chão
      this.pack = undefined;
    }
    this.audio.setMood(index);

    const [sx, sz] = def.spawn ?? [0, 3.4];
    this.root.position.set(sx, 0, sz);
    this.root.rotation.set(0, Math.PI, 0);
    this.heading = Math.PI;
    this.idleT = 0;
    this.reminders = 0;
    if (def.id === 'recreio' && this.pets.size === 0) this.togglePet('cachorro'); // o cachorro vem brincar
    this.sleeping = !!def.sleepStart;
    this.ngZone.run(() => {
      this.routine.sleeping.set(this.sleeping);
      this.routine.busy.set(false);
      this.routine.progressBar.set(0);
    });
    if (this.sleeping) this.placeInBed();

    this.placePetsNear();
    this.camSnap = true;
  }

  /** 1 = luz normal, 0.2 = quase escuro */
  private setLightFactor(f: number): void {
    if (!this.lights) return;
    this.lights.amb.intensity = 1.8 * f;
    this.lights.hemi.intensity = 1.2 * f;
    this.lights.dir.intensity = 1.3 * f;
  }

  private placeInBed(): void {
    this.root.position.set(-4.6, 0.98, -4.1 + this.charH);
    this.root.rotation.y = 0;
    this.pose.lie = -Math.PI / 2;
    this.applyPose();
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

  // ---------------------------------------------------------------- MARCADORES E GUIA

  private makeMarker(): { g: THREE.Group; arrow: THREE.Mesh; ring: THREE.Mesh } {
    const mat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), mat(0xfacc15, 0.25));
    bg.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), mat(0xfacc15, 0.95));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), mat(0xfacc15, 1));
    arrow.rotation.x = Math.PI;
    g.add(bg, ring, arrow);
    g.visible = false;
    this.scene.add(g);
    return { g, arrow, ring };
  }

  /** Pontinhos que mostram o caminho até o objetivo (ajuda forte, some aos poucos) */
  private buildGuide(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.guide.push(m);
    }
  }

  private hideMarkers(): void {
    this.markers.forEach((m) => (m.g.visible = false));
    this.guide.forEach((m) => (m.visible = false));
  }

  // ---------------------------------------------------------------- ROTINA E AÇÕES

  private updateRoutine(dt: number): void {
    if (this.act) {
      this.hideMarkers();
      this.runAction(dt);
      return;
    }
    const cands = this.routine.candidates();
    if (!this.routine.started() || !cands.length || this.routine.roomDone()) {
      this.hideMarkers();
      return;
    }
    if (this.demoStep) {
      this.hideMarkers();
      this.walkDemo(dt);
      return;
    }
    const steps = this.routine.room().steps;

    // lembra a instrução se a criança demorar (no máximo 2 vezes por etapa)
    const key = `${this.routine.roomIndex()}:${cands.join(',')}`;
    if (key !== this.lastStepKey) {
      this.lastStepKey = key;
      this.idleT = 0;
      this.reminders = 0;
    }
    this.idleT += dt;
    if (this.idleT > 16 && this.reminders < 2) {
      this.reminders++;
      this.idleT = 0;
      this.speakStep('');
    }

    const only = cands.length === 1 ? steps[cands[0]] : null;
    // acordar: começa ao mexer no joystick/teclas
    if (only && only.trigger === 'move' && this.sleeping) {
      this.hideMarkers();
      if (this.inputActive) this.startAction(only, cands[0]);
      return;
    }
    // etapas automáticas (ex.: dentista): começam sozinhas depois de um instante
    if (only && only.auto) {
      this.hideMarkers();
      if (this.idleT > 2.2) this.startAction(only, cands[0]);
      return;
    }

    // quanto de ajuda mostrar (diminui conforme a criança vai ficando independente)
    const lvl = this.progress.profile().prompt;
    const showMarker = lvl >= 2 || (lvl === 1 && this.idleT > 6) || (lvl === 0 && this.idleT > 18);
    const showGuide = lvl >= 3 || this.idleT > 10;
    this.markerT += dt;

    while (this.markers.length < cands.length) this.markers.push(this.makeMarker());
    let nearest = -1;
    let nearestD = Infinity;
    this.markers.forEach((m, j) => {
      const i = cands[j];
      if (i === undefined) {
        m.g.visible = false;
        return;
      }
      const st = steps[i];
      m.g.visible = showMarker;
      m.g.position.set(st.x, 0.08, st.z);
      m.arrow.position.y = 2.3 + Math.sin(this.markerT * 4 + j) * 0.2;
      m.ring.scale.setScalar(1 + Math.sin(this.markerT * 5 + j) * 0.06);
      const d = Math.hypot(this.root.position.x - st.x, this.root.position.z - st.z);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    });

    // pontinhos até o objetivo mais próximo
    const tgt = nearest >= 0 ? steps[nearest] : undefined;
    this.guide.forEach((g, k) => {
      if (!tgt || !showGuide || nearestD < 1.6) {
        g.visible = false;
        return;
      }
      const f = ((k + (this.markerT * 1.2) % 1) / this.guide.length) % 1;
      g.visible = true;
      g.position.set(
        this.root.position.x + (tgt.x - this.root.position.x) * f,
        0.09,
        this.root.position.z + (tgt.z - this.root.position.z) * f
      );
    });

    // chegou perto de uma etapa: começa
    if (!this.sleeping && !this.locked) {
      for (const i of cands) {
        const st = steps[i];
        if (Math.hypot(this.root.position.x - st.x, this.root.position.z - st.z) < INTERACT_RADIUS) {
          this.startAction(st, i);
          return;
        }
      }
    }
  }

  /** "Mostre-me": anda até o lugar e faz a ação */
  private walkDemo(dt: number): void {
    const d = this.demoStep!;
    const s = d.step;
    d.t += dt;
    const p = this.root.position;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (this.sleeping || this.locked || dist < 0.35 || d.t > 4.5) {
      this.demoStep = undefined;
      this.startAction(s, d.idx, true);
      return;
    }
    const sp = Math.min(WALK_SPEED * 1.4 * dt, dist);
    p.x += (dx / dist) * sp;
    p.z += (dz / dist) * sp;
    this.heading = Math.atan2(dx, dz);
    let diff = this.heading - this.root.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.root.rotation.y += diff * (1 - Math.exp(-14 * dt));
    this.isMoving = true;
    this.isRunning = false;
  }

  private startAction(step: StepDef, idx: number, demo = false): void {
    const action = ACTIONS[step.action];
    const faceYaw = Math.atan2(step.look[0] - step.x, step.look[1] - step.z);
    this.root.updateMatrixWorld(true);
    const ctx = this.makeCtx(step, faceYaw);
    this.act = { idx, demo, step, action, ctx, t: 0 };
    this.sleeping = false;
    this.lastProgress = -1;
    this.ngZone.run(() => {
      this.routine.sleeping.set(false);
      this.routine.busy.set(true);
      this.routine.progressBar.set(0);
    });
    action.start?.(ctx);
  }

  private runAction(dt: number): void {
    const a = this.act!;
    a.t += dt;
    a.ctx.time = a.t;
    const p = Math.min(1, a.t / a.action.duration);
    this.root.updateMatrixWorld(true);

    this.handReq = {}; // as ações pedem as mãos a cada quadro
    a.ctx.moving = false;

    // aproxima do ponto certo e olha para o móvel
    if (!a.action.ownsMove) {
      const k = 1 - Math.exp(-10 * dt);
      this.root.position.x += (a.step.x - this.root.position.x) * k;
      this.root.position.z += (a.step.z - this.root.position.z) * k;
      this.root.position.y = this.pose.y;
    }
    if (a.t < 0.45) {
      let diff = a.ctx.faceYaw - this.root.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.root.rotation.y += diff * (1 - Math.exp(-12 * dt));
    }
    this.isRunning = false;

    a.action.update(a.ctx, p, dt);
    this.isMoving = a.ctx.moving || (!a.action.ownsMove && a.t < 0.3); // anda até o ponto

    const q = Math.round(p * 50);
    if (q !== this.lastProgress) {
      this.lastProgress = q;
      this.ngZone.run(() => this.routine.progressBar.set(q / 50));
    }
    if (p >= 1) this.finishAction();
  }

  private finishAction(): void {
    const a = this.act!;
    this.act = undefined;
    this.resetPose();
    a.action.end?.(a.ctx); // depois do reset: ex.: o ônibus mantém a criança escondida
    this.isMoving = false;
    this.handReq = {};
    this.cheer = 1.4;
    this.idleT = 0;
    this.audio.sfx('chime');
    this.fx.sparkle(new THREE.Vector3(this.root.position.x, this.charH * 0.9, this.root.position.z), 22);

    this.ngZone.run(() => {
      this.routine.busy.set(false);
      this.routine.progressBar.set(0);
      const roomName = this.routine.room().name;
      const roomFinished = this.routine.completeStep(a.idx);
      if (!roomFinished) {
        const praise = PRAISES[Math.floor(Math.random() * PRAISES.length)];
        window.setTimeout(() => this.speakStep(this.fmt(praise) + ' '), 900);
        return;
      }
      this.audio.sfx('fanfare');
      this.voice.speak(this.fmt(`Parabéns, {nome}! Você terminou: ${roomName}.`));
      const p = this.root.position;
      this.fx.confetti(p.x, 1.5, p.z, 110);
      window.setTimeout(() => this.fx.confetti(p.x, 1.5, p.z, 80), 700);
      window.setTimeout(() => this.ngZone.run(() => this.routine.screen.set('end')), ROOM_CHANGE_DELAY);
    });
  }

  private makeCtx(step: StepDef, faceYaw: number): ActionCtx {
    const H = this.charH;
    const state: Record<string, unknown> = {};
    return {
      props: this.props,
      root: this.root,
      room: this.roomGroup!,
      H,
      stand: new THREE.Vector3(step.x, 0, step.z),
      faceYaw,
      fx: this.fx,
      audio: this.audio,
      pose: this.pose,
      time: 0,
      moving: false,
      state,
      at: (fx, fy, fz) => this.root.localToWorld(new THREE.Vector3(fx * H, fy * H, fz * H)),
      held: () => this.held,
      hold: (o) => {
        if (this.held && this.held !== o) this.held.parent?.remove(this.held);
        this.root.attach(o);
        o.position.set(0, 0.55 * H, 0.3 * H);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(Math.max(0.6, H / 1.8));
        this.held = o;
      },
      release: () => {
        const o = this.held;
        if (!o) return undefined;
        this.roomGroup!.attach(o);
        this.held = undefined;
        return o;
      },
      discard: () => this.discardHeld(),
      lock: (v) => (this.locked = v),
      setLight: (f) => this.setLightFactor(f),
      say: (t) => this.voice.speak(this.fmt(t), false),
      reach: (side, target, w = 1) => {
        this.handReq[side] = target ? { p: target.clone(), w } : undefined;
      },
      look: (x, z, dt) => {
        const yaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
        let diff = yaw - this.root.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.root.rotation.y += diff * (1 - Math.exp(-10 * dt));
      },
      unwearBackpack: () => {
        const o = this.pack;
        if (!o) return undefined;
        this.roomGroup!.attach(o);
        this.pack = undefined;
        return o;
      },
      pet: () => {
        const p = this.pets.get('cachorro') ?? [...this.pets.values()][0];
        if (!p) return undefined;
        p.controlled = true;
        return {
          root: p.root,
          set: (m: boolean, f = false) => {
            p.moving = m;
            p.fast = f;
          },
          release: () => {
            p.controlled = false;
            p.moving = false;
          },
        };
      },
      recolorTop: (hex) => this.setTopColor(hex),
      setVisible: (v) => (this.root.visible = v),
      wearBackpack: (o) => {
        this.root.attach(o);
        o.position.set(0, 0.62 * H - 0.4, -0.22 * H);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar((H / 1.8) * 0.8);
        this.pack = o;
      },
      once: (key, fn) => {
        if (!state['_o' + key]) {
          state['_o' + key] = true;
          fn();
        }
      },
      every: (key, dt, interval, fn) => {
        const k = '_e' + key;
        state[k] = ((state[k] as number) ?? 0) + dt;
        while ((state[k] as number) >= interval) {
          state[k] = (state[k] as number) - interval;
          fn();
        }
      },
    };
  }

  private discardHeld(): void {
    if (this.held) {
      this.held.parent?.remove(this.held);
      this.held = undefined;
    }
  }

  private resetPose(): void {
    Object.assign(this.pose, { y: 0, lean: 0, sway: 0, stretch: 0, lie: 0 });
    this.root.visible = true;
    this.applyPose();
    if (!this.sleeping && !this.locked) this.root.position.y = 0;
  }

  private applyPose(): void {
    this.root.rotation.x = this.pose.lie + this.pose.lean;
    this.root.rotation.z = this.pose.sway;
    this.root.scale.y = 1 + this.pose.stretch;
  }

  // ---------------------------------------------------------------- PERSONAGEM

  private async loadCharacter(type: CharacterType): Promise<void> {
    const token = ++this.loadToken;

    if (this.model) this.root.remove(this.model);
    this.mixer?.stopAllAction();
    this.mixer = undefined;
    this.actions = {};
    this.currentAnim = undefined;
    this.model = undefined;
    this.topMats = [];

    try {
      // Humanos: Quaternius .gltf (animações já vêm dentro do arquivo)
      const gltf = await new GLTFLoader().loadAsync(`assets/models/${type}.gltf`);
      if (token !== this.loadToken) return;

      const model = gltf.scene;
      this.prepareMeshes(model);
      this.applyOutfit(model, type);

      this.model = model;
      this.root.add(model);

      this.addRoyalAccessories(model, type); // mede a altura (charH) e cria coroa/saia/capa
      this.setupClips(model, gltf.animations);
      this.setTopColor(this.progress.settings().topColor);
      this.findArms(model);
      if (this.sleeping) this.placeInBed();
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

  private applyOutfit(model: THREE.Object3D, type: CharacterType): void {
    const outfit = OUTFITS[type];
    if (!outfit) return;

    const parts = Object.keys(MATERIAL_KEYWORDS) as OutfitPart[];

    model.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isArray = Array.isArray(mesh.material);
      const mats = (isArray ? mesh.material : [mesh.material]) as THREE.Material[];
      const meshName = mesh.name.toLowerCase();

      const recolored = mats.map((mat) => {
        const matName = mat.name.toLowerCase();
        if (PROTECTED.test(matName)) return mat;

        let part = parts.find((p) => outfit[p] !== undefined && MATERIAL_KEYWORDS[p].some((k) => matName.includes(k)));
        if (!part) {
          part = parts.find((p) => outfit[p] !== undefined && MESH_KEYWORDS[p].some((k) => meshName.includes(k)));
        }
        if (!part) return mat;

        const copy = mat.clone() as THREE.MeshStandardMaterial; // clone: não afeta outros modelos
        if (!copy.color) return mat;
        copy.color.setHex(outfit[part] as number);
        if (part === 'top') this.topMats.push(copy); // a "troca de roupa" muda esta cor
        return copy;
      });

      mesh.material = isArray ? recolored : recolored[0];
    });
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

    // Mede com o personagem em pé e virado para frente, depois restaura
    const savedRot = this.root.rotation.clone();
    const savedScale = this.root.scale.clone();
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.root.updateMatrixWorld(true);
    const restore = () => {
      this.root.rotation.copy(savedRot);
      this.root.scale.copy(savedScale);
      this.root.updateMatrixWorld(true);
    };

    const box = new THREE.Box3().setFromObject(model, true);
    const H = box.max.y - box.min.y;
    if (!isFinite(H) || H <= 0) {
      restore();
      return;
    }
    this.charH = H;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const y = (k: number) => box.min.y + H * k;

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

    restore();
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
      if (clip) this.actions[name] = this.mixer!.clipAction(clip);
      else console.warn(`Animação "${name}" não encontrada. Ajuste ANIM_PATTERNS.`);
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
    if (this.routine.paused()) {
      this.renderer.render(this.scene, this.camera); // pausa (cantinho da calma)
      return;
    }

    this.updateMovement(dt);
    if (!this.sleeping && !this.locked && !this.act) this.resolveCollisions(this.root.position, PLAYER_RADIUS);
    this.updateRoutine(dt);
    this.applyPose();

    this.playAnim(!this.isMoving ? 'idle' : this.isRunning ? 'run' : 'walk');
    this.mixer?.update(dt);
    this.animateHumanExtras(dt);
    this.applyHands(dt);

    this.cheer = Math.max(0, this.cheer - dt);
    this.updatePets(dt);
    this.animateAmbient(dt);
    this.fx.update(dt);

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateMovement(dt: number): void {
    let mx = 0;
    let mz = 0;
    let run = false;

    const joyMag = Math.hypot(this.joy.x, this.joy.y);
    if (joyMag > 0.15) {
      // Joystick virtual (celular)
      mx = this.joy.x;
      mz = this.joy.y;
      run = joyMag > 0.92; // empurrar até o fim = correr
    } else {
      if (this.keys['w'] || this.keys['arrowup']) mz -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) mz += 1;
      if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) mx += 1;
      run = !!this.keys['shift'];
    }

    this.inputActive = mx !== 0 || mz !== 0;
    if (!this.routine.started()) {
      this.inputActive = false;
      this.isMoving = false;
      return;
    }
    if (this.sleeping || this.locked || this.act) {
      this.isMoving = false;
      this.isRunning = false;
      return;
    }
    this.isRunning = run;
    this.isMoving = this.inputActive;
    if (!this.isMoving) return;

    const len = Math.hypot(mx, mz); // diagonal não fica mais rápida
    mx /= len;
    mz /= len;
    this.heading = Math.atan2(mx, mz);

    const speed = (this.isRunning ? RUN_SPEED : WALK_SPEED) * dt;
    this.root.position.x += mx * speed;
    this.root.position.z += mz * speed;

    let diff = this.heading - this.root.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.root.rotation.y += diff * (1 - Math.exp(-14 * dt));
  }

  // Limites da sala + móveis (círculo contra retângulos). Serve para o personagem e os pets.
  private resolveCollisions(p: THREE.Vector3, r: number): void {
    p.x = Math.min(this.boundW / 2 - 0.7, Math.max(-this.boundW / 2 + 0.7, p.x));
    p.z = Math.min(this.boundD / 2 - 0.7, Math.max(-this.boundD / 2 + 0.7, p.z));

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

  // ---------------------------------------------------------------- BRAÇOS (IK)

  /** Procura ombro, cotovelo e mão de cada lado, pelo nome dos ossos */
  private findArms(model: THREE.Object3D): void {
    this.arms = {};
    const bones: THREE.Object3D[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o);
    });
    const side = (n: string): 'l' | 'r' | undefined => {
      if (/left/i.test(n)) return 'l';
      if (/right/i.test(n)) return 'r';
      if (/(^|[._\-\s])l($|[._\-\s])/i.test(n)) return 'l';
      if (/(^|[._\-\s])r($|[._\-\s])/i.test(n)) return 'r';
      if (/[a-z]L$/.test(n)) return 'l';
      if (/[a-z]R$/.test(n)) return 'r';
      return undefined;
    };
    const isUpper = (n: string) =>
      /upper[_ .\-]?arm|arm[_ .\-]?upper|^arm[._\- ]?[lr]?$/i.test(n) || (/arm$/i.test(n) && !/fore|lower/i.test(n));
    const isLower = (n: string) => /lower[_ .\-]?arm|fore[_ .\-]?arm|arm[_ .\-]?lower|elbow/i.test(n);
    const isHand = (n: string) => /hand|wrist/i.test(n) && !/thumb|index|middle|ring|pinky|finger|metacarpal|carpal|palm/i.test(n);

    this.root.updateMatrixWorld(true);
    const dist = (a: THREE.Object3D, b: THREE.Object3D) =>
      a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));

    for (const sd of ['l', 'r'] as const) {
      const upper = bones.find((b) => side(b.name) === sd && isUpper(b.name));
      const lower = bones.find((b) => side(b.name) === sd && isLower(b.name));
      const hand = bones.find((b) => side(b.name) === sd && isHand(b.name));
      if (upper && lower && hand) this.arms[sd] = { upper, lower, hand, a: dist(upper, lower), b: dist(lower, hand) };
    }
    if (!this.arms.l || !this.arms.r) {
      console.warn(
        '[braços] não encontrei os ossos dos braços. Me envie esta lista:',
        bones.map((b) => b.name)
      );
    } else {
      console.info('[braços] ok:', this.arms.l.upper.name, this.arms.l.lower.name, this.arms.l.hand.name);
    }
  }

  /** Mãos pedidas pelas ações (ou seguindo o objeto que a criança segura) */
  private applyHands(dt: number): void {
    if (!this.arms.l && !this.arms.r) return;
    const req = this.handReq;
    const H = this.charH;

    // segurando algo sem pedido específico: as duas mãos acompanham o objeto
    if (!req.l && !req.r && this.held && !this.sleeping) {
      const hp = this.held.getWorldPosition(new THREE.Vector3());
      const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
      req.l = { p: hp.clone().add(xAxis.clone().multiplyScalar(0.12 * H)), w: 0.85 };
      req.r = { p: hp.clone().sub(xAxis.clone().multiplyScalar(0.12 * H)), w: 0.85 };
    }

    this.root.updateMatrixWorld(true);
    for (const sd of ['l', 'r'] as const) {
      const st = this.handState[sd];
      const r = req[sd];
      st.w += ((r ? r.w : 0) - st.w) * (1 - Math.exp(-12 * dt));
      if (r) st.p.copy(r.p);
      const arm = this.arms[sd];
      if (arm && st.w > 0.02) this.applyArmIK(arm, st.p, st.w, sd === 'l' ? 1 : -1);
    }
  }

  private applyArmIK(arm: ArmRig, target: THREE.Vector3, w: number, sideSign: number): void {
    const sp = arm.upper.getWorldPosition(new THREE.Vector3());
    const toT = target.clone().sub(sp);
    let d = toT.length();
    d = Math.min(Math.max(d, Math.abs(arm.a - arm.b) + 0.02), (arm.a + arm.b) * 0.995);
    const dir = toT.normalize();

    // lei dos cossenos: onde fica o cotovelo
    const cosA = THREE.MathUtils.clamp((arm.a * arm.a + d * d - arm.b * arm.b) / (2 * arm.a * d), -1, 1);
    const angA = Math.acos(cosA);
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(sideSign * 0.3, -1, -0.5).applyQuaternion(rq); // cotovelo para baixo e para fora
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
    perp.normalize();
    const elbow = sp.clone().add(dir.clone().multiplyScalar(arm.a * cosA)).add(perp.multiplyScalar(arm.a * Math.sin(angA)));
    const hand = sp.clone().add(dir.clone().multiplyScalar(d));

    this.aimBone(arm.upper, arm.lower, elbow, w);
    this.aimBone(arm.lower, arm.hand, hand, w);
  }

  /** Gira `bone` para que o osso filho aponte para `desired` (sem depender dos eixos do modelo) */
  private aimBone(bone: THREE.Object3D, child: THREE.Object3D, desired: THREE.Vector3, w: number): void {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(true, false);
    const bp = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    const cp = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
    const cur = cp.sub(bp).normalize();
    const des = desired.clone().sub(bp).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(cur, des);
    const bq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    const local = pq.invert().multiply(q.multiply(bq));
    bone.quaternion.slerp(local, w);
    bone.updateMatrixWorld(true);
  }

  // Detalhes vivos do cenário (ex.: o "Zzz" balançando)
  private animateAmbient(dt: number): void {
    const z = this.props['zzz'];
    if (z && z.visible) z.position.y = 2.6 + Math.sin(this.clock.elapsedTime * 2) * 0.12;
  }

  // ---------------------------------------------------------------- PETS (acompanham o personagem)

  private spawnPet(type: PetType): void {
    const pet: Pet = { type, root: new THREE.Group(), cycle: 0, idle: 0, moving: false, fast: false };
    this.pets.set(type, pet);
    this.scene.add(pet.root);
    this.placePetsNear();

    new FBXLoader()
      .loadAsync(`assets/models/${type}.fbx`)
      .then((fbx) => {
        if (this.pets.get(type) !== pet) return; // foi dispensado enquanto carregava
        fbx.scale.setScalar(0.004);
        this.prepareMeshes(fbx);
        pet.model = fbx;
        pet.root.add(fbx);
      })
      .catch((err) => console.warn(`Erro ao carregar ${type}:`, err));
  }

  private placePetsNear(): void {
    let i = 0;
    this.pets.forEach((pet) => {
      const side = i % 2 === 0 ? -1 : 1;
      pet.root.position.set(
        this.root.position.x + side * 1.0,
        0,
        this.root.position.z + 1.2 + Math.floor(i / 2) * 0.8
      );
      this.resolveCollisions(pet.root.position, PET_RADIUS);
      i++;
    });
  }

  private updatePets(dt: number): void {
    const p = this.root.position;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let i = 0;

    this.pets.forEach((pet) => {
      const idx = i++;
      if (pet.controlled) {
        this.animatePet(pet, dt); // a ação (ex.: buscar a bola) move o bichinho
        return;
      }
      const side = idx % 2 === 0 ? -1 : 1;
      const back = 1.4 + Math.floor(idx / 2) * 0.9;
      const tx = p.x - fx * back + fz * side * 0.9;
      const tz = p.z - fz * back - fx * side * 0.9;

      const pos = pet.root.position;
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const d = Math.hypot(dx, dz);
      let yawTarget: number;
      pet.moving = false;
      pet.fast = false;

      if (d > 0.25) {
        const speed = Math.min(RUN_SPEED * 1.15, 2.2 + d * 2.4);
        const step = Math.min(speed * dt, d);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        pet.moving = true;
        pet.fast = speed > WALK_SPEED * 1.4;
        yawTarget = Math.atan2(dx, dz);
      } else {
        yawTarget = Math.atan2(p.x - pos.x, p.z - pos.z); // parado: olha para o dono
      }
      this.resolveCollisions(pos, PET_RADIUS);

      let diff = yawTarget - pet.root.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      pet.root.rotation.y += diff * (1 - Math.exp(-10 * dt));

      this.animatePet(pet, dt);
    });
  }

  // Pets (malha estática): pulinho, balanço, squash e festinha quando a etapa termina
  private animatePet(pet: Pet, dt: number): void {
    const m = pet.model;
    if (!m) return;
    const base = 0.004;

    if (this.cheer > 0) {
      pet.cycle += dt * 13;
      const hop = Math.abs(Math.sin(pet.cycle));
      m.position.y = hop * 0.45;
      m.rotation.z = Math.sin(pet.cycle) * 0.15;
      m.rotation.x = 0;
      m.scale.set(base, base, base);
    } else if (pet.moving) {
      pet.idle = 0;
      pet.cycle += dt * (pet.fast ? 16 : 11);
      const hop = Math.abs(Math.sin(pet.cycle));
      m.position.y = hop * (pet.fast ? 0.28 : 0.16);
      m.rotation.z = Math.sin(pet.cycle) * 0.12;
      m.rotation.x = pet.fast ? 0.15 : 0.07;
      const squash = 1 - hop * 0.05;
      m.scale.set(base * (2 - squash), base * squash, base * (2 - squash));
    } else {
      pet.cycle = 0;
      pet.idle += dt * 2.2;
      const breath = Math.sin(pet.idle);
      m.position.y = 0;
      m.rotation.z *= 0.85;
      m.rotation.x *= 0.85;
      m.rotation.y = Math.sin(pet.idle * 0.4) * 0.12;
      m.scale.set(base, base * (1 + breath * 0.015), base);
    }
  }

  // ---------------------------------------------------------------- CÂMERA

  private updateCamera(dt: number): void {
    const p = this.root.position;
    const py = this.sleeping ? 0 : p.y;
    // celular em pé (tela estreita): afasta a câmera para caber a cena
    const zoom = Math.min(1.9, Math.max(1, 1.05 / this.camera.aspect));
    this.camTarget.set(p.x, py + this.camOff[0] * zoom, p.z + this.camOff[1] * zoom);
    if (this.camSnap) {
      this.camera.position.copy(this.camTarget); // sem "voar" ao trocar de sala
      this.camSnap = false;
    } else {
      this.camera.position.lerp(this.camTarget, 1 - Math.exp(-8 * dt));
    }
    this.camera.lookAt(p.x, py + 1.0, p.z);
  }

  private onResize(): void {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h);
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResizeBound);
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.removeEventListener(ev, this.unlockAudio);
    window.removeEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.removeEventListener('resize', this.onResizeBound);
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.wakeLock?.release();
    this.audio.water(false);
    this.audio.stopMusic();
    this.renderer?.dispose();
  }
}