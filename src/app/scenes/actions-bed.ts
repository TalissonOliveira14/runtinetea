import * as THREE from 'three';
import type { ActionId } from './rooms';
import type { ClothBlanket } from './cloth';
import { Action, ActionCtx, V, ease, seg, lerp, fly } from './action-kit';

const BED_Y = 0.8; // altura do colchão
const cloth = (c: ActionCtx) => c.props['blanket'].userData['cloth'] as ClothBlanket;

interface Leg {
  t0: number;
  t1: number;
  a: [number, number];
  b: [number, number];
  look?: [number, number]; // Infinity em z = "mesmo z de quem está andando"
}

export const BED_ACTIONS: Partial<Record<ActionId, Action>> = {
  // ================================================================ ACORDAR
  wake: {
    duration: 3.6,
    ownsMove: true,
    start(c) {
      c.state.start = c.root.position.clone();
      c.audio.sfx('yawn');
    },
    update(c, p) {
      c.props['zzz'].visible = p < 0.08;
      const cl = cloth(c);
      const k = ease(seg(p, 0.05, 0.32));
      // a criança joga a coberta para o lado: ela sai de cima dela e vira um bolo
      cl.params.raise = 0.45 * (1 - k);
      cl.params.pile = k;
      cl.params.wrinkle = lerp(0.035, 0.12, k);
      cl.params.smoothL = cl.params.smoothR = lerp(1.2, 0, k);
      c.props['blanket'].position.y = BED_Y + Math.sin(Math.PI * k) * 0.5;
      cl.update();

      const m = ease(seg(p, 0.12, 0.62));
      c.root.position.lerpVectors(c.state.start, c.stand, m);
      c.root.position.y = lerp(c.state.start.y, 0, m) + Math.sin(Math.PI * m) * 0.3;
      c.pose.lie = (-Math.PI / 2) * (1 - m);
      const s = seg(p, 0.62, 0.97);
      c.pose.stretch = Math.sin(Math.PI * s) * 0.07;
      c.pose.lean = -Math.sin(Math.PI * s) * 0.12;
      if (p > 0.62 && p < 0.97) {
        const w = Math.sin(Math.PI * s); // espreguiçar: braços para cima
        c.reach('l', c.at(0.2, 1.2, 0.05), w);
        c.reach('r', c.at(-0.2, 1.2, 0.05), w);
      }
      if (p > 0.62)
        c.once('sp', () => {
          c.fx.sparkle(c.at(0, 1.0, 0.1));
          c.audio.sfx('sparkle');
          c.fx.popup('☀️', c.at(0, 1.3, 0));
        });
    },
    end(c) {
      c.props['zzz'].visible = false;
      const cl = cloth(c);
      cl.params.pile = 1;
      cl.params.raise = 0;
      cl.params.smoothL = cl.params.smoothR = 0;
      c.props['blanket'].position.y = BED_Y;
      cl.update();
      c.root.position.copy(c.stand);
    },
  },

  // ================================================================ ARRUMAR A CAMA (passo a passo)
  makeBed: {
    duration: 20.2,
    ownsMove: true,
    start(c) {
      const p = c.root.position;
      const A: [number, number] = [p.x, p.z];
      const B: [number, number] = [-2.9, -2.0]; // ao lado do bolo de coberta
      const C: [number, number] = [-4.6, -0.55]; // pé da cama
      const R0: [number, number] = [-2.95, -1.5];
      const R1: [number, number] = [-2.95, -3.5];
      const F1: [number, number] = [-3.0, -0.6];
      const F2: [number, number] = [-6.0, -0.6];
      const L0: [number, number] = [-6.0, -1.5];
      const L1: [number, number] = [-6.0, -3.5];
      const LP: [number, number] = [-6.0, -4.2];
      const route: Leg[] = [
        { t0: 0, t1: 1.3, a: A, b: B, look: [-3.55, -2.1] }, // vai até a coberta
        { t0: 1.3, t1: 2.4, a: B, b: B, look: [-3.55, -2.1] }, // pega
        { t0: 2.4, t1: 4.2, a: B, b: C, look: [-4.6, -2.5] }, // levanta e abre
        { t0: 4.2, t1: 5.4, a: C, b: C, look: [-4.6, -2.5] }, // sacode
        { t0: 5.4, t1: 6.6, a: C, b: R0, look: [-4.6, -2.5] },
        { t0: 6.6, t1: 9.0, a: R0, b: R1, look: [-4.6, Infinity] }, // alisa o lado direito
        { t0: 9.0, t1: 9.9, a: R1, b: F1 },
        { t0: 9.9, t1: 10.4, a: F1, b: F2 },
        { t0: 10.4, t1: 10.8, a: F2, b: L0 },
        { t0: 10.8, t1: 13.2, a: L0, b: L1, look: [-4.6, Infinity] }, // alisa o lado esquerdo
        { t0: 13.2, t1: 16.0, a: L1, b: L1, look: [-4.6, -3.7] }, // dobra a pontinha e dá tapinhas
        { t0: 16.0, t1: 16.5, a: L1, b: LP },
        { t0: 16.5, t1: 20.2, a: LP, b: LP, look: [-4.6, -4.2] }, // travesseiro e ursinho
      ];
      c.state.route = route;
      c.state.teddyFrom = c.props['teddy'].position.clone();
      c.audio.sfx('whoosh');
    },
    update(c, _p, dt) {
      const t = c.time;
      const cl = cloth(c);
      const prm = cl.params;
      const sw = (a: number, b: number) => ease(seg(t, a, b));
      const say = (key: string, at: number, text: string) => {
        if (t >= at) c.once(key, () => c.say(text));
      };

      // ---------- onde a criança está
      const route = c.state.route as Leg[];
      let leg = route[route.length - 1];
      for (const l of route) {
        if (t >= l.t0 && t < l.t1) {
          leg = l;
          break;
        }
      }
      const k = ease(seg(t, leg.t0, leg.t1));
      const x = lerp(leg.a[0], leg.b[0], k);
      const z = lerp(leg.a[1], leg.b[1], k);
      c.root.position.set(x, 0, z);
      c.moving = leg.a[0] !== leg.b[0] || leg.a[1] !== leg.b[1];
      const lk = leg.look ?? leg.b;
      c.look(lk[0], Number.isFinite(lk[1]) ? lk[1] : z, dt);

      // ---------- o lençol
      prm.pile = 1 - sw(2.4, 4.2);
      prm.grabL = prm.grabR = sw(2.4, 3.2) * (1 - sw(4.6, 5.2));
      prm.raise = 0.5 * Math.sin(Math.PI * seg(t, 4.2, 5.4));
      prm.smoothR = 1.12 * sw(6.6, 9.0);
      prm.smoothL = 1.12 * sw(10.8, 13.2);
      prm.fold = Math.PI * sw(13.4, 15.2);
      const lift = 0.9 * sw(2.4, 3.4) * (1 - sw(4.4, 5.4));
      c.props['blanket'].position.y = BED_Y + lift;
      cl.update();

      // ---------- mãos e corpo
      if (t >= 1.3 && t < 2.4) {
        const g = V(-3.55, 0.95, -2.1);
        c.reach('l', g, sw(1.3, 1.8));
        c.reach('r', g, sw(1.3, 1.8));
        c.pose.lean = 0.35 * Math.sin(Math.PI * seg(t, 1.2, 2.5));
      } else if (t >= 2.4 && t < 5.0) {
        c.reach('l', cl.cornerWorld('l'), 1);
        c.reach('r', cl.cornerWorld('r'), 1);
      } else if (t >= 6.6 && t < 9.0) {
        const vf = Math.min(1, Math.max(0, 1 - prm.smoothR));
        c.reach('r', cl.pointWorld(0.8, Math.min(1, vf + 0.05)).add(V(0, 0.06, 0)), 1);
        c.reach('l', cl.pointWorld(0.62, Math.min(1, vf + 0.14)).add(V(0, 0.06, 0)), 1);
        c.pose.lean = 0.2;
        c.every('s1', dt, 0.18, () => c.audio.sfx('scrub'));
      } else if (t >= 10.8 && t < 13.2) {
        const vf = Math.min(1, Math.max(0, 1 - prm.smoothL));
        c.reach('l', cl.pointWorld(0.2, Math.min(1, vf + 0.05)).add(V(0, 0.06, 0)), 1);
        c.reach('r', cl.pointWorld(0.38, Math.min(1, vf + 0.14)).add(V(0, 0.06, 0)), 1);
        c.pose.lean = 0.2;
        c.every('s2', dt, 0.18, () => c.audio.sfx('scrub'));
      } else if (t >= 13.2 && t < 15.4) {
        c.reach('l', cl.pointWorld(0.12, 0.03), 1); // segura a pontinha e dobra
        c.reach('r', cl.pointWorld(0.32, 0.03), 1);
        c.pose.lean = 0.25;
      } else if (t >= 15.4 && t < 16.0) {
        const pat = cl.pointWorld(0.25, 0.3).add(V(0, 0.05 + 0.04 * Math.sin(t * 20), 0)); // tapinhas
        c.reach('r', pat, 1);
        c.reach('l', pat.clone().add(V(0, 0, 0.3)), 1);
        c.pose.lean = 0.25;
      } else if (t >= 16.5 && t < 17.9) {
        const q = Math.max(0, Math.sin((t - 16.5) * 14));
        c.props['pillow'].scale.set(1 + 0.2 * q, 1 - 0.35 * q, 1 + 0.15 * q); // ajeita o travesseiro
        c.reach('l', V(-5.3, 1.15, -4.2), 1);
        c.reach('r', V(-4.95, 1.15, -4.2), 1);
        c.pose.lean = 0.3;
      } else if (t >= 17.9) {
        const tdy = c.props['teddy'];
        c.props['pillow'].scale.set(1, 1, 1);
        const kk = ease(seg(t, 18.6, 19.5));
        if (t < 18.6) {
          c.reach('r', V(-6.4, 0.3, -4.0), sw(17.9, 18.3));
          c.pose.lean = 0.5 * Math.sin(Math.PI * seg(t, 17.9, 18.7));
        } else if (kk < 1) {
          fly(tdy, c.state.teddyFrom, V(-4.6, 1.05, -4.15), kk, 1.3);
          c.reach('r', tdy.getWorldPosition(new THREE.Vector3()), 1);
        }
        if (kk >= 1) {
          tdy.position.set(-4.6, 1.05, -4.15);
          c.once('pop', () => {
            c.audio.sfx('pop');
            c.fx.sparkle(V(-4.6, 1.4, -4.1), 22);
            c.fx.popup('🧸', c.at(0, 1.3, 0.1), 1.6, 1.0);
          });
        }
      }

      // ---------- sons e fala
      if (t >= 4.2) c.once('toss', () => c.audio.sfx('whoosh'));
      if (t >= 5.4) c.once('land', () => c.audio.sfx('pop'));
      if (t >= 13.4) c.once('fold', () => c.audio.sfx('whoosh'));
      say('s1', 4.0, 'Sacuda bem o lençol.');
      say('s2', 6.8, 'Agora, alise com as mãos.');
      say('s3', 13.3, 'Dobre a pontinha.');
      say('s4', 16.1, 'Ajeite o travesseiro.');
      say('s5', 17.9, 'Agora, coloque o ursinho.');
    },
    end(c) {
      const cl = cloth(c);
      const prm = cl.params;
      prm.pile = 0;
      prm.raise = 0;
      prm.grabL = prm.grabR = 0;
      prm.smoothL = prm.smoothR = 1.12;
      prm.fold = Math.PI;
      c.props['blanket'].position.y = BED_Y;
      cl.update();
      c.props['pillow'].scale.set(1, 1, 1);
      c.props['teddy'].position.set(-4.6, 1.05, -4.15);
      c.moving = false;
    },
  },
};