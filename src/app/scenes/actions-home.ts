import * as THREE from 'three';
import type { ActionId } from './rooms';
import { Action, ActionCtx, V, rnd, ease, seg, lerp, fly, drop, WATER } from './action-kit';

function makeBrush(): THREE.Group {
  const g = new THREE.Group();
  const m = (c: number) => new THREE.MeshStandardMaterial({ color: c });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), m(0x38bdf8)));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.1), m(0xffffff));
  head.position.z = 0.2;
  const bristle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.08), m(0xf472b6));
  bristle.position.set(0, 0.04, 0.2);
  g.add(head, bristle);
  return g;
}

function makeCan(): THREE.Group {
  const g = new THREE.Group();
  const m = (c: number) => new THREE.MeshStandardMaterial({ color: c });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 16), m(0x38bdf8)));
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.38), m(0x0ea5e9));
  spout.position.set(0, 0.1, 0.28);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), m(0x0284c7));
  handle.position.set(0, 0.05, -0.24);
  g.add(spout, handle);
  return g;
}

// ------------------------------------------------------------------ ações da casa

export const HOME_ACTIONS: Partial<Record<ActionId, Action>> = {
  // ================================================================ QUARTO
  dress: {
    duration: 3.8,
    start: (c) => c.audio.sfx('open'),
    update(c, p) {
      const open = ease(seg(p, 0, 0.15)) * (1 - ease(seg(p, 0.8, 0.95)));
      c.props['wardL'].rotation.y = -1.7 * open;
      c.props['wardR'].rotation.y = 1.7 * open;
      const k = ease(seg(p, 0.2, 0.7));
      c.root.rotation.y = c.faceYaw + Math.PI * 2 * k;
      c.pose.y = Math.sin(Math.PI * k) * 0.2;
      c.reach('r', c.at(-0.15, 0.7, 0.52), p < 0.22 ? 1 : 0);
      if (p > 0.2) c.once('w', () => c.audio.sfx('whoosh'));
      if (p > 0.45)
        c.once('color', () => {
          const palette = [0xef4444, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316, 0xec4899, 0x06b6d4];
          c.recolorTop(palette[Math.floor(Math.random() * palette.length)]);
          c.fx.sparkle(c.at(0, 0.6, 0.1), 30);
          c.audio.sfx('sparkle');
        });
      if (p > 0.88)
        c.once('close', () => {
          c.audio.sfx('close');
          c.fx.popup('👕', c.at(0, 1.3, 0.1));
        });
    },
    end(c) {
      c.props['wardL'].rotation.y = 0;
      c.props['wardR'].rotation.y = 0;
      c.root.rotation.y = c.faceYaw;
    },
  },

  backpack: {
    duration: 3.6,
    start(c) {
      c.state.from = c.props['pack'].position.clone();
    },
    update(c, p) {
      const pk = c.props['pack'];
      c.pose.lean = 0.35 * Math.sin(Math.PI * seg(p, 0, 0.35));
      if (p < 0.3) {
        const w = pk.getWorldPosition(new THREE.Vector3()).add(V(0, 0.45, 0));
        c.reach('l', w, 1);
        c.reach('r', w, 1);
      }
      if (!c.state.worn) {
        const k = ease(seg(p, 0.25, 0.72));
        fly(pk, c.state.from, c.at(0, 0.62, -0.25).sub(V(0, 0.4, 0)), k, 0.9);
        pk.rotation.y = k * Math.PI * 2;
        if (k > 0) c.once('w', () => c.audio.sfx('whoosh'));
      }
      if (p >= 0.72)
        c.once('wear', () => {
          c.state.worn = true;
          c.wearBackpack(pk);
          c.audio.sfx('pop');
          c.fx.sparkle(c.at(0, 0.7, -0.3), 20);
        });
      c.pose.y = Math.sin(Math.PI * seg(p, 0.72, 0.9)) * 0.12;
      if (p > 0.9) c.once('end', () => c.fx.popup('🎒', c.at(0, 1.3, 0.1)));
    },
  },

  // ================================================================ BANHEIRO
  toilet: {
    duration: 4.2,
    start(c) {
      c.props['privacy'].visible = true;
    },
    update(c, p) {
      const pv = c.props['privacy'];
      pv.scale.y = Math.max(0.001, ease(seg(p, 0, 0.15)) * (1 - ease(seg(p, 0.9, 1))));
      if (p > 0.16)
        c.once('hide', () => {
          c.setVisible(false);
          c.audio.sfx('close');
          c.fx.popup('🚽', V(4.6, 2.9, -2.6), 3.0, 1.1);
        });
      if (p > 0.6) {
        c.once('flush', () => c.audio.sfx('flush'));
        if (p < 0.88)
          c.every('sw', 0.016, 0.03, () => {
            const a = c.time * 12;
            drop(c, 4.6 + Math.cos(a) * 0.3, 0.75, -3.8 + Math.sin(a) * 0.3, -Math.sin(a) * 0.6, 0.2, Math.cos(a) * 0.6, 0.35);
          });
      }
      if (p > 0.9)
        c.once('back', () => {
          c.setVisible(true);
          c.fx.sparkle(c.at(0, 0.9, 0.1));
          c.audio.sfx('sparkle');
        });
    },
    end(c) {
      c.setVisible(true);
      const pv = c.props['privacy'];
      pv.visible = false;
      pv.scale.y = 0.001;
    },
  },

  washHands: {
    duration: 4.8,
    start: (c) => c.audio.water(true),
    update(c, p, dt) {
      const x = c.stand.x;
      c.every('w', dt, 0.02, () => drop(c, x + rnd() * 0.04, 1.38, -4.35, 0, 0.1, 0.25, 0.45));
      c.pose.lean = 0.12;
      c.pose.sway = Math.sin(c.time * 14) * 0.05;
      if (p > 0.12 && p < 0.85) {
        const hp = c.at(Math.sin(c.time * 14) * 0.05, 0.5, 0.33);
        c.reach('l', hp.clone().add(V(0.08, 0, 0)), 1);
        c.reach('r', hp.clone().add(V(-0.08, 0, 0)), 1);
        c.every('f', dt, 0.07, () => {
          const w = c.at(rnd() * 0.3, 0.5, 0.33);
          c.fx.foam.emit(w.x, w.y, w.z, rnd() * 0.3, 0.5, rnd() * 0.3, 0xffffff, 0.9);
        });
        c.every('s', dt, 0.2, () => c.audio.sfx('scrub'));
      }
      if (p > 0.9)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('🧼', c.at(0, 1.3, 0.1));
        });
    },
    end: (c) => c.audio.water(false),
  },

  brush: {
    duration: 5.4,
    start(c) {
      const b = makeBrush();
      c.root.add(b);
      c.state.brush = b;
    },
    update(c, p, dt) {
      const H = c.H;
      const b = c.state.brush as THREE.Group;
      const scrub = p > 0.1 && p < 0.75 ? Math.sin(c.time * 20) * 0.04 * H : 0;
      b.position.set(scrub, 0.86 * H, 0.15 * H);
      b.rotation.z = scrub * 4;
      c.pose.lean = 0.06;
      if (p > 0.1 && p < 0.75) {
        c.reach('r', c.at(0, 0.86, 0.15), 1);
        c.every('f', dt, 0.1, () => {
          const w = c.at(rnd() * 0.05, 0.84, 0.19);
          c.fx.foam.emit(w.x, w.y, w.z, rnd() * 0.3, 0.4, rnd() * 0.3, 0xffffff, 0.8);
        });
        c.every('s', dt, 0.16, () => c.audio.sfx('scrub'));
      }
      if (p > 0.78 && p < 0.95) {
        c.once('water', () => c.audio.water(true));
        c.every('w', dt, 0.02, () => drop(c, c.stand.x + rnd() * 0.04, 1.38, -4.35, 0, 0.1, 0.25, 0.45));
      }
      if (p > 0.95)
        c.once('end', () => {
          c.audio.water(false);
          c.audio.sfx('sparkle');
          c.fx.popup('😁', c.at(0, 1.25, 0.1), 1.6, 1.0);
          c.fx.sparkle(c.at(0, 0.86, 0.2), 20);
        });
    },
    end(c) {
      const b = c.state.brush as THREE.Group;
      c.root.remove(b);
      c.audio.water(false);
    },
  },

  shower: {
    duration: 6.8,
    start: (c) => c.audio.water(true),
    update(c, p, dt) {
      const sx = c.stand.x;
      const sz = c.stand.z;
      c.every('w', dt, 0.015, () => {
        for (let i = 0; i < 3; i++)
          drop(c, sx + rnd() * 0.55, 3.15, sz + rnd() * 0.55, rnd() * 0.3, -3, rnd() * 0.3, 0.58);
        c.fx.water.emit(sx + rnd() * 1.0, 0.06, sz + rnd() * 1.0, rnd(), 1.5, rnd(), WATER, 0.25);
      });
      c.every('st', dt, 0.1, () => c.fx.steam.emit(sx + rnd() * 0.8, 0.8 + Math.random(), sz + rnd() * 0.6, rnd() * 0.2, 0.5, rnd() * 0.2, 0xffffff, 1.6));
      c.pose.sway = Math.sin(c.time * 5) * 0.04;
      if (p > 0.2 && p < 0.7) {
        c.reach('l', c.at(0.12, 1.0, 0.08), 1);
        c.reach('r', c.at(-0.12, 1.0, 0.08), 1);
      }
      c.pose.y = Math.abs(Math.sin(c.time * 4)) * 0.03;
      if (p > 0.2 && p < 0.7) {
        c.every('f', dt, 0.05, () => {
          const w = c.at(rnd() * 0.3, 0.98 + Math.random() * 0.06, rnd() * 0.3);
          c.fx.foam.emit(w.x, w.y, w.z, rnd() * 0.2, 0.2, rnd() * 0.2, 0xffffff, 1.2);
        });
        c.every('s', dt, 0.22, () => c.audio.sfx('scrub'));
      }
      if (p > 0.92)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('✨', c.at(0, 1.3, 0.1), 1.6, 1.0);
        });
    },
    end: (c) => c.audio.water(false),
  },

  // ================================================================ COZINHA
  fruit: {
    duration: 3.6,
    start(c) {
      c.state.from = c.props['apple'].position.clone();
      c.audio.sfx('open');
    },
    update(c, p) {
      const open = ease(seg(p, 0, 0.2)) * (1 - ease(seg(p, 0.78, 0.96)));
      c.props['fridgeDoor'].rotation.y = 1.8 * open;
      const apple = c.props['apple'];
      if (p < 0.66) c.reach('r', apple.getWorldPosition(new THREE.Vector3()), seg(p, 0.05, 0.25));
      if (!c.state.held) {
        const k = ease(seg(p, 0.25, 0.65));
        fly(apple, c.state.from, c.at(0, 0.55, 0.3), k, 0.6);
        apple.rotation.y = k * 6;
      }
      if (p >= 0.65)
        c.once('hold', () => {
          c.state.held = true;
          c.hold(apple);
          c.audio.sfx('pop');
          c.fx.sparkle(c.at(0, 0.55, 0.3), 12);
        });
      c.pose.y = Math.sin(Math.PI * seg(p, 0.65, 0.8)) * 0.1;
      if (p > 0.82) c.once('close', () => c.audio.sfx('close'));
      if (p > 0.9) c.once('end', () => c.fx.popup('🍎', c.at(0, 1.3, 0.1)));
    },
    end(c) {
      c.props['fridgeDoor'].rotation.y = 0;
    },
  },

  eat: {
    duration: 6.4,
    start(c) {
      c.state.plateFrom = c.props['plate'].position.clone();
    },
    update(c, p) {
      const H = c.H;
      const apple = c.held();
      if (apple && !c.state.eaten) {
        let m = 0;
        for (let i = 0; i < 3; i++) {
          const s = 0.08 + 0.23 * i;
          m = Math.max(m, Math.sin(Math.PI * seg(p, s, s + 0.23)));
          if (p > s + 0.115)
            c.once('bite' + i, () => {
              apple.scale.multiplyScalar(0.72);
              c.audio.sfx('munch');
              const w = c.at(0, 0.86, 0.2);
              c.fx.spark.burst(w.x, w.y, w.z, 8, [0xef4444, 0xfef3c7], 1.5, 0.6);
            });
        }
        apple.position.set(0, lerp(0.55, 0.88, m) * H, lerp(0.3, 0.16, m) * H);
        c.pose.y = p > 0.08 && p < 0.8 ? Math.abs(Math.sin(c.time * 16)) * 0.03 : 0;
        c.pose.lean = 0.05;
      }
      if (p > 0.82) {
        c.once('gone', () => {
          c.discard();
          c.state.eaten = true;
          c.props['plate'].userData['crumbs'].visible = true;
          c.fx.popup('😋', c.at(0, 1.3, 0.1), 1.6, 1.0);
          c.audio.sfx('pop');
        });
        const plate = c.props['plate'];
        if (!c.state.plateHeld) fly(plate, c.state.plateFrom, c.at(0, 0.55, 0.3), ease(seg(p, 0.82, 0.98)), 0.5);
        if (p >= 0.98)
          c.once('ph', () => {
            c.state.plateHeld = true;
            c.hold(plate);
          });
      }
    },
  },

  dishes: {
    duration: 5.6,
    start(c) {
      c.state.plate = c.release() ?? c.props['plate'];
      c.state.from = c.state.plate.position.clone();
      c.audio.water(true);
    },
    update(c, p, dt) {
      const pl = c.state.plate as THREE.Object3D;
      const sink = V(3.5, 1.55, -3.85);
      const pw = pl.getWorldPosition(new THREE.Vector3());
      c.reach('l', pw.clone().add(V(0.15, 0, 0)), 1);
      c.reach('r', pw.clone().add(V(-0.15, 0, 0)), 1);
      const rack = V(4.7, 1.12, -4.0);
      if (p < 0.85) {
        const k = ease(seg(p, 0, 0.2));
        fly(pl, c.state.from, sink, k, 0.3);
        pl.rotation.x = k * 0.5 + Math.sin(c.time * 10) * 0.05 * k;
      } else {
        const k = ease(seg(p, 0.85, 1));
        fly(pl, sink, rack, k, 0.4);
        pl.rotation.x = 0.5 * (1 - k);
      }
      if (p > 0.2 && p < 0.85) {
        c.every('w', dt, 0.02, () => drop(c, 3.5 + rnd() * 0.04, 1.38, -4.3, 0, 0.1, 0.1, 0.35));
        c.every('f', dt, 0.08, () => c.fx.foam.emit(3.5 + rnd() * 0.3, 1.6, -3.85 + rnd() * 0.2, rnd() * 0.2, 0.4, rnd() * 0.2, 0xffffff, 0.9));
        c.every('s', dt, 0.2, () => c.audio.sfx('scrub'));
      }
      if (p > 0.6) pl.userData['crumbs'].visible = false;
      c.pose.lean = 0.12;
      c.pose.sway = Math.sin(c.time * 14) * 0.04;
      if (p > 0.93)
        c.once('end', () => {
          c.audio.water(false);
          c.audio.sfx('sparkle');
          c.fx.sparkle(rack.clone().add(V(0, 0.3, 0)), 16);
        });
    },
    end(c) {
      c.audio.water(false);
      const pl = c.state.plate as THREE.Object3D;
      pl.position.set(4.7, 1.12, -4.0);
      pl.rotation.set(0, 0, 0);
    },
  },

  cabinet: {
    duration: 4.4,
    start(c) {
      c.state.from = c.props['plate'].position.clone();
      c.audio.sfx('open');
    },
    update(c, p) {
      const open = ease(seg(p, 0, 0.2)) * (1 - ease(seg(p, 0.78, 0.95)));
      c.props['cabL'].rotation.y = -1.6 * open;
      c.props['cabR'].rotation.y = 1.6 * open;
      fly(c.props['plate'], c.state.from, V(6.3, 1.7, 1.5), ease(seg(p, 0.25, 0.62)), 1.5);
      if (p > 0.25 && p < 0.62) c.reach('r', c.props['plate'].getWorldPosition(new THREE.Vector3()), 1);
      if (p > 0.62) c.once('pop', () => c.audio.sfx('pop'));
      if (p > 0.82) c.once('close', () => c.audio.sfx('close'));
      if (p > 0.9)
        c.once('end', () => {
          c.fx.popup('👍', c.at(0, 1.3, 0.1), 1.6, 1.0);
          c.fx.sparkle(c.at(0, 0.8, 0.2), 16);
          c.audio.sfx('sparkle');
        });
    },
    end(c) {
      c.props['cabL'].rotation.y = 0;
      c.props['cabR'].rotation.y = 0;
    },
  },

  // ================================================================ SALA
  toys: {
    duration: 5.4,
    start(c) {
      c.state.from = ['toy1', 'toy2', 'toy3'].map((n) => c.props[n].position.clone());
    },
    update(c, p) {
      const box = V(-6.1, 1.0, 2.0);
      let hop = 0;
      ['toy1', 'toy2', 'toy3'].forEach((n, i) => {
        const o = c.props[n];
        const s = 0.1 + 0.26 * i;
        const k = ease(seg(p, s, s + 0.24));
        if (k < 1 && p >= s - 0.05) c.reach('r', o.getWorldPosition(new THREE.Vector3()), 1);
        if (k > 0 && k < 1) {
          fly(o, c.state.from[i], box, k, 1.6);
          o.rotation.y = k * 8;
        }
        if (k >= 1) {
          o.visible = false;
          c.once('land' + i, () => {
            c.audio.sfx('pop');
            c.fx.sparkle(box, 12);
          });
          hop = Math.max(hop, Math.sin(Math.PI * seg(p, s + 0.24, s + 0.4)));
        }
      });
      c.pose.y = hop * 0.12;
      c.pose.lean = 0.1;
      c.props['toybox'].scale.y = 1 + hop * 0.08;
      if (p > 0.92) c.once('end', () => c.fx.popup('🧸', c.at(0, 1.3, 0.1), 1.6, 1.0));
    },
    end(c) {
      c.props['toybox'].scale.y = 1;
    },
  },

  shoes: {
    duration: 4.8,
    start(c) {
      c.state.from = ['shoes1', 'shoes2'].map((n) => c.props[n].position.clone());
    },
    update(c, p) {
      const to = [V(6.4, 1.2, -2.9), V(6.4, 1.2, -2.0)];
      ['shoes1', 'shoes2'].forEach((n, i) => {
        const o = c.props[n];
        const s = 0.1 + 0.4 * i;
        const k = ease(seg(p, s, s + 0.4));
        if (k < 1 && p >= s - 0.05) c.reach('r', o.getWorldPosition(new THREE.Vector3()), 1);
        if (k > 0) {
          fly(o, c.state.from[i], to[i], k, 2.2);
          o.rotation.y = lerp(i === 1 ? 0.6 : 0, Math.PI / 2, k);
        }
        if (k >= 1)
          c.once('land' + i, () => {
            c.audio.sfx('pop');
            c.fx.sparkle(to[i], 12);
          });
        if (k > 0 && k < 0.05) c.once('w' + i, () => c.audio.sfx('whoosh'));
      });
      c.pose.lean = 0.12 * Math.sin(Math.PI * seg(p, 0, 0.5));
      c.pose.y = Math.abs(Math.sin(c.time * 6)) * 0.04;
      if (p > 0.92) c.once('end', () => c.fx.popup('👟', c.at(0, 1.3, 0.1), 1.6, 1.0));
    },
  },

  plant: {
    duration: 5.2,
    start(c) {
      const can = makeCan();
      c.state.can = can;
      c.hold(can);
      c.audio.sfx('pop');
    },
    update(c, p, dt) {
      const can = c.state.can as THREE.Group;
      can.rotation.x = 0.85 * ease(seg(p, 0.12, 0.28)) * (1 - ease(seg(p, 0.8, 0.92)));
      c.pose.lean = 0.08;
      if (p > 0.25 && p < 0.82) {
        c.once('wOn', () => c.audio.water(true));
        can.updateWorldMatrix(true, false);
        const sp = can.localToWorld(V(0, 0.1, 0.47));
        const dir = V(5 - sp.x, 0, -4 - sp.z).normalize().multiplyScalar(3.2);
        c.every('w', dt, 0.02, () => drop(c, sp.x, sp.y, sp.z, dir.x + rnd() * 0.3, 0.8, dir.z + rnd() * 0.3, 0.7));
      }
      if (p >= 0.82) c.once('wOff', () => c.audio.water(false));
      const grow = ease(seg(p, 0.3, 0.85));
      c.props['plant'].scale.setScalar(1 + 0.35 * grow);
      if (p > 0.7) {
        const fl = c.props['flowers'];
        fl.visible = true;
        fl.scale.setScalar(ease(seg(p, 0.7, 0.85)));
      }
      if (p > 0.88)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('🌸', V(5, 2.4, -4), 1.8, 1.1);
          c.fx.sparkle(V(5, 1.6, -4), 20);
        });
    },
    end(c) {
      c.audio.water(false);
      c.discard();
    },
  },

  book: {
    duration: 5.6,
    start(c) {
      c.state.from = c.props['book'].position.clone();
      c.audio.sfx('whoosh');
    },
    update(c, p, dt) {
      const bk = c.props['book'];
      if (p < 0.86 && !c.state.held) {
        fly(bk, c.state.from, c.at(0, 0.62, 0.32), ease(seg(p, 0.05, 0.3)), 0.5);
      }
      if (p >= 0.3 && p < 0.86)
        c.once('hold', () => {
          c.state.held = true;
          c.hold(bk);
          c.audio.sfx('pop');
        });
      if (c.state.held && p < 0.86) {
        bk.rotation.x = -0.5;
        c.pose.lean = 0.1;
        c.pose.sway = Math.sin(c.time * 3) * 0.03;
        if (p > 0.35)
          c.every('pop', dt, 0.7, () =>
            c.fx.popup(['⭐', '💡', '📖', '🌈'][Math.floor(Math.random() * 4)], c.at(rnd() * 0.6, 1.25, 0.2), 1.6, 0.7)
          );
      }
      if (p >= 0.86) {
        c.once('rel', () => {
          c.state.rel = c.release();
          c.state.relPos = bk.position.clone();
          c.audio.sfx('whoosh');
        });
        if (c.state.relPos) {
          fly(bk, c.state.relPos, c.state.from, ease(seg(p, 0.86, 1)), 0.6);
          bk.rotation.set(0, 0, 0);
        }
      }
      if (p > 0.94) c.once('end', () => c.fx.popup('🌟', c.at(0, 1.3, 0.1), 1.6, 1.0));
    },
    end(c) {
      c.props['book'].position.copy(c.state.from);
      c.props['book'].rotation.set(0, 0, 0);
    },
  },
};