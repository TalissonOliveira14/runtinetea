import * as THREE from 'three';

export interface ClothParams {
  pile: number; // 1 = bolo amontoado ao lado da cama, 0 = aberto
  raise: number; // altura extra (lençol no ar / cobrindo a criança)
  wrinkle: number; // tamanho das rugas
  smoothL: number; // alisado do lado esquerdo (0 a 1.12), do pé para a cabeceira
  smoothR: number; // alisado do lado direito
  fold: number; // dobra da pontinha de cima (0 a PI)
  grabL: number; // canto esquerdo do pé levantado pela mão
  grabR: number;
}

const W = 2.25; // largura (x)
const L = 2.4; // comprimento (z): v=0 cabeceira, v=1 pé da cama
const NX = 24;
const NZ = 20;
const FOLD_V = 0.2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Lençol/coberta de pano: malha com rugas que alisam, amontoa, voa e dobra. */
export class ClothBlanket {
  readonly mesh: THREE.Mesh;
  params: ClothParams = { pile: 0, raise: 0, wrinkle: 0.1, smoothL: 0, smoothR: 0, fold: 0, grabL: 0, grabR: 0 };

  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private tmp = new THREE.Vector3();

  constructor() {
    const n = (NX + 1) * (NZ + 1);
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const idx: number[] = [];
    const base = new THREE.Color(0x3b82f6);
    const stripe = new THREE.Color(0x93c5fd);
    const flap = new THREE.Color(0xe0f2fe);
    const c = new THREE.Color();

    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX;
        const v = j / NZ;
        c.copy(Math.floor(u * 9) % 2 ? stripe : base);
        if (v < FOLD_V + 0.01) c.copy(flap); // "avesso" que aparece quando dobra
        const k = j * (NX + 1) + i;
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
        if (i < NX && j < NZ) {
          const a = k;
          const b = k + 1;
          const d = k + NX + 1;
          idx.push(a, d, b, b, d, d + 1);
        }
      }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.update();
  }

  /** Posição (local) do ponto (u,v) do tecido com todas as deformações */
  point(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.params;
    const x0 = (u - 0.5) * W;
    const z0 = (v - 0.5) * L;

    // quanto já foi alisado neste ponto
    const sL = clamp01((p.smoothL - (1 - v)) / 0.12);
    const sR = clamp01((p.smoothR - (1 - v)) / 0.12);
    const t = smooth(0.35, 0.65, u);
    const sm = sL * (1 - t) + sR * t;

    const wave = 0.5 * Math.sin(x0 * 8 + 1.3) + 0.35 * Math.sin(z0 * 9.7 - x0 * 5.3) + 0.25 * Math.sin(x0 * 14 + z0 * 11);
    let x = x0;
    let y = 0.17 + p.raise + p.wrinkle * (1 - sm) * wave;
    let z = z0;

    // cantos do pé levantados pelas mãos
    if (p.grabL > 0) y += p.grabL * Math.exp(-((u - 0.02) ** 2 / 0.015 + (v - 0.98) ** 2 / 0.04));
    if (p.grabR > 0) y += p.grabR * Math.exp(-((u - 0.98) ** 2 / 0.015 + (v - 0.98) ** 2 / 0.04));

    // bolo amontoado na beirada da cama
    if (p.pile > 0) {
      const hx = 1.05 + x0 * 0.38 + 0.08 * Math.sin(z0 * 7);
      const hz = 0.45 + z0 * 0.38 + 0.08 * Math.cos(x0 * 6);
      let hy = 0.15 + 0.3 * Math.abs(Math.sin(x0 * 5.5 + z0 * 4.2)) + 0.12 * Math.cos(z0 * 9);
      if (hx > 1.2) hy -= Math.min(0.75, (hx - 1.2) * 1.4); // parte pendurada para fora da cama
      x = lerp(x, hx, p.pile);
      y = lerp(y, hy, p.pile);
      z = lerp(z, hz, p.pile);
    }

    // pontinha de cima dobrada para baixo
    if (p.fold > 0.001 && v < FOLD_V) {
      const zf = (FOLD_V - 0.5) * L;
      const d = zf - z;
      z = zf - d * Math.cos(p.fold);
      y += d * Math.sin(p.fold) + 0.03 * (p.fold / Math.PI);
    }
    return out.set(x, y, z);
  }

  update(): void {
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        this.point(i / NX, j / NZ, this.tmp);
        const k = (j * (NX + 1) + i) * 3;
        this.pos[k] = this.tmp.x;
        this.pos[k + 1] = this.tmp.y;
        this.pos[k + 2] = this.tmp.z;
      }
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** Ponto do tecido em coordenadas do mundo (para as mãos seguirem) */
  pointWorld(u: number, v: number): THREE.Vector3 {
    this.point(u, v, this.tmp);
    this.mesh.updateWorldMatrix(true, false);
    return this.mesh.localToWorld(this.tmp.clone());
  }

  /** Canto do pé: 'l' (esquerdo de quem está no pé da cama) ou 'r' */
  cornerWorld(side: 'l' | 'r'): THREE.Vector3 {
    return this.pointWorld(side === 'l' ? 0.02 : 0.98, 0.98);
  }
}