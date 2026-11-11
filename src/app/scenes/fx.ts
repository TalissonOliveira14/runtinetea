import * as THREE from 'three';

function dotTexture(soft: boolean): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.85, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** Sprite com um emoji (💤, ✨, 😁...) */
export function emojiSprite(emoji: string, size = 1): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.font = '88px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

/** Sistema de partículas simples (água, espuma, vapor, brilhos) */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private geo: THREE.BufferGeometry;
  private cursor = 0;
  private color = new THREE.Color();

  constructor(private max: number, size: number, private gravity: number, soft = false, opacity = 1) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.clear();
    const mat = new THREE.PointsMaterial({
      size,
      map: dotTexture(soft),
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      alphaTest: 0.02,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -999;
    this.geo.getAttribute('position').needsUpdate = true;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.vel[j] = vx;
    this.vel[j + 1] = vy;
    this.vel[j + 2] = vz;
    this.color.setHex(color);
    this.col[j] = this.color.r;
    this.col[j + 1] = this.color.g;
    this.col[j + 2] = this.color.b;
    this.life[i] = life;
  }

  burst(x: number, y: number, z: number, count: number, colors: number[], speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.emit(
        x, y, z,
        (Math.random() - 0.5) * speed * 2,
        Math.random() * speed + speed * 0.4,
        (Math.random() - 0.5) * speed * 2,
        c, life * (0.7 + Math.random() * 0.6)
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -999;
        continue;
      }
      this.vel[j + 1] += this.gravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }
}

interface Popup { s: THREE.Sprite; age: number; life: number; size: number }

/** Todos os efeitos visuais do jogo */
export class Fx {
  readonly group = new THREE.Group();
  readonly water = new Particles(900, 0.09, -9);
  readonly foam = new Particles(300, 0.16, 0.5);
  readonly steam = new Particles(120, 0.8, 0.7, true, 0.22);
  readonly spark = new Particles(500, 0.16, -4);
  private popups: Popup[] = [];
  /** menos brilho e confete (sensibilidade sensorial) */
  calm = false;

  constructor() {
    this.group.add(this.water.points, this.foam.points, this.steam.points, this.spark.points);
  }

  /** Emoji que sobe e some (feedback visual: ✨ 😁 👍) */
  popup(emoji: string, pos: THREE.Vector3, life = 1.4, size = 0.9): void {
    const s = emojiSprite(emoji, size);
    s.material.depthTest = false;
    s.renderOrder = 10;
    s.position.copy(pos);
    this.group.add(s);
    this.popups.push({ s, age: 0, life, size });
  }

  sparkle(pos: THREE.Vector3, count = 18): void {
    if (this.calm) count = Math.ceil(count / 3);
    this.spark.burst(pos.x, pos.y, pos.z, count, [0xfacc15, 0xfde68a, 0xf9a8d4, 0x93c5fd], 2.2, 0.8);
  }

  confetti(x: number, y: number, z: number, count = 90): void {
    if (this.calm) count = Math.ceil(count / 6);
    const colors = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xec4899, 0xa855f7];
    for (let i = 0; i < count; i++) {
      this.spark.emit(
        x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 3,
        colors[Math.floor(Math.random() * colors.length)], 1.6 + Math.random() * 0.8
      );
    }
  }

  update(dt: number): void {
    this.water.update(dt);
    this.foam.update(dt);
    this.steam.update(dt);
    this.spark.update(dt);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      const k = p.age / p.life;
      const mat = p.s.material as THREE.SpriteMaterial;
      if (k >= 1) {
        this.group.remove(p.s);
        mat.map?.dispose();
        mat.dispose();
        this.popups.splice(i, 1);
        continue;
      }
      p.s.position.y += dt * 0.7;
      const s = p.size * (0.4 + 0.6 * Math.min(1, p.age * 5));
      p.s.scale.set(s, s, 1);
      mat.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }

  clear(): void {
    this.water.clear();
    this.foam.clear();
    this.steam.clear();
    this.spark.clear();
    this.popups.forEach((p) => this.group.remove(p.s));
    this.popups = [];
  }
}