import * as THREE from 'three';
import type { ActionId } from './rooms';
import type { ClothBlanket } from './cloth';
import { Action, V, rnd, ease, seg, lerp, fly, drop } from './action-kit';

const cloth = (c: { props: Record<string, THREE.Object3D> }) => c.props['blanket'].userData['cloth'] as ClothBlanket;

/** Pegar um produto da prateleira e colocar no carrinho (que vem junto com a criança) */
const pick = (prop: string, emoji: string): Action => ({
  duration: 4,
  start(c) {
    c.state.from = c.props[prop].position.clone();
    c.state.cf = c.props['cart'].position.clone();
    c.state.n = (c.props['cart'].userData['n'] as number | undefined) ?? 0;
  },
  update(c, p) {
    const it = c.props[prop];
    const cart = c.props['cart'];
    const cartTo = V(c.stand.x + 0.9, 0, c.stand.z + 0.7);
    cart.position.lerpVectors(c.state.cf, cartTo, ease(seg(p, 0, 0.2)));
    const k = ease(seg(p, 0.15, 0.6));
    if (!c.state.in) {
      c.reach('r', it.getWorldPosition(new THREE.Vector3()), seg(p, 0.05, 0.2));
      fly(it, c.state.from, V(cartTo.x, 0.6 + 0.18 * c.state.n, cartTo.z), k, 1.0);
    }
    if (p >= 0.6)
      c.once('in', () => {
        c.state.in = true;
        cart.attach(it);
        cart.userData['n'] = c.state.n + 1;
        c.audio.sfx('pop');
        c.fx.popup(emoji, c.at(0.3, 1.3, 0.3), 1.6, 1.0);
        c.fx.sparkle(it.getWorldPosition(new THREE.Vector3()), 12);
      });
    c.pose.lean = 0.12 * Math.sin(Math.PI * seg(p, 0.1, 0.65));
  },
});

export const MORE_ACTIONS: Partial<Record<ActionId, Action>> = {
  pickBread: pick('bread', '🍞'),
  pickMilk: pick('milk', '🥛'),
  pickFruit: pick('fruit', '🍊'),

  // ================================================================ PAGAR NO CAIXA
  pay: {
    duration: 9.5,
    start(c) {
      c.state.cf = c.props['cart'].position.clone();
    },
    update(c, p) {
      const cart = c.props['cart'];
      cart.position.lerpVectors(c.state.cf, V(c.stand.x - 1.0, 0, c.stand.z + 0.2), ease(seg(p, 0, 0.1)));
      const names = ['bread', 'milk', 'fruit'];
      // 1) as compras vão para o balcão, uma por uma (o caixa "bipa")
      names.forEach((n, i) => {
        const it = c.props[n];
        const s = 0.1 + 0.14 * i;
        const k = ease(seg(p, s, s + 0.14));
        if (k > 0 && !c.state['moved' + i]) {
          if (!c.state['r' + i]) {
            c.state['r' + i] = true;
            c.room.attach(it);
            c.state['from' + i] = it.position.clone();
          }
          fly(it, c.state['from' + i], V(4.4 + 0.45 * i, 1.05, -0.5), k, 0.9);
          if (k < 1) c.reach('r', it.getWorldPosition(new THREE.Vector3()), 1);
        }
        if (k >= 1)
          c.once('beep' + i, () => {
            c.audio.sfx('pop');
            c.fx.popup('🔔', V(5.3, 1.9, -0.5), 0.9, 0.5);
          });
      });
      // 2) a moeda
      if (p > 0.56)
        c.once('coin', () => {
          c.say('São cinco reais.');
          c.fx.popup('🪙', c.at(0.2, 1.1, 0.5), 1.6, 0.9);
          c.audio.sfx('sparkle');
        });
      if (p > 0.66) c.once('receipt', () => c.fx.popup('🧾', V(5.4, 2.1, -0.5), 1.6, 0.9));
      // 3) as compras vão para a sacola
      const bag = c.props['bag'];
      if (p > 0.68) bag.visible = true;
      names.forEach((n, i) => {
        const it = c.props[n];
        const s = 0.7 + 0.06 * i;
        const k = ease(seg(p, s, s + 0.08));
        if (k > 0 && k < 1) fly(it, V(4.4 + 0.45 * i, 1.05, -0.5), V(4.2, 1.3, -0.5), k, 0.5);
        if (k >= 1) it.visible = false;
      });
      // 4) pega a sacola
      if (p >= 0.93)
        c.once('hold', () => {
          c.hold(bag);
          c.audio.sfx('pop');
          c.say('Obrigada! Volte sempre!');
          c.fx.popup('🛍️', c.at(0, 1.3, 0.2), 1.8, 1.1);
        });
      if (p > 0.1 && p < 0.55) c.pose.lean = 0.08;
    },
  },

  // ================================================================ DENTISTA
  sitChair: {
    duration: 4.2,
    ownsMove: true,
    start(c) {
      c.state.start = c.root.position.clone();
      c.say('Respire fundo. Está tudo bem.');
    },
    update(c, p, dt) {
      const target = V(0, 0.92, -3.6 + c.H);
      const m = ease(seg(p, 0.1, 0.7));
      c.root.position.lerpVectors(c.state.start, target, m);
      c.root.position.y = lerp(0, 0.92, m) + Math.sin(Math.PI * m) * 0.25;
      c.pose.lie = (-Math.PI / 2) * m;
      if (p > 0.1) c.root.rotation.y += (0 - c.root.rotation.y) * (1 - Math.exp(-8 * dt));
      c.moving = p < 0.3;
      if (p > 0.75) c.once('ok', () => c.fx.popup('😌', V(0, 2.2, -2.6), 1.6, 1.0));
    },
    end(c) {
      c.lock(true);
      c.pose.lie = -Math.PI / 2;
      c.root.position.set(0, 0.92, -3.6 + c.H);
      c.root.rotation.y = 0;
    },
  },

  openMouth: {
    duration: 8,
    ownsMove: true,
    update(c, p) {
      c.root.position.set(0, 0.92, -3.6 + c.H);
      c.root.rotation.y = 0;
      c.pose.lie = -Math.PI / 2;
      const d = c.props['dentist'];
      const k = ease(seg(p, 0.05, 0.2));
      d.position.set(lerp(-1.3, -0.8, k), 0, lerp(-2.6, -3.2, k));
      d.rotation.x = 0.2 * k;
      c.once('o', () => c.fx.popup('😮', V(0, 2.3, -2.6), 2.2, 1.1));
      if (p > 0.25) c.once('n1', () => c.say('Um.'));
      if (p > 0.42) c.once('n2', () => c.say('Dois.'));
      if (p > 0.59) c.once('n3', () => c.say('Três. Pronto!'));
      c.pose.stretch = Math.sin(c.time * 2) * 0.01;
      if (p > 0.85)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('🦷', V(0, 2.3, -2.6), 1.8, 1.1);
          c.fx.sparkle(V(0, 1.4, -3.3), 18);
        });
    },
    end(c) {
      c.lock(true);
      c.pose.lie = -Math.PI / 2;
      c.root.position.set(0, 0.92, -3.6 + c.H);
      const d = c.props['dentist'];
      d.position.set(-1.3, 0, -2.6);
      d.rotation.x = 0;
    },
  },

  rinse: {
    duration: 8,
    ownsMove: true,
    start(c) {
      c.lock(false);
      c.state.s0 = c.root.position.clone();
      c.state.cupFrom = c.props['cup'].position.clone();
    },
    update(c, p, dt) {
      const r = c.root;
      const s0 = c.state.s0 as THREE.Vector3;
      c.moving = false;
      if (p < 0.2) {
        const k = ease(seg(p, 0, 0.2)); // senta e levanta da cadeira
        r.position.set(lerp(s0.x, 1.0, k), lerp(s0.y, 0, k), lerp(s0.z, -2.3, k));
        c.pose.lie = (-Math.PI / 2) * (1 - k);
        r.rotation.y += (Math.PI / 2 - r.rotation.y) * (1 - Math.exp(-8 * dt));
      } else if (p < 0.45) {
        const k = ease(seg(p, 0.2, 0.45));
        r.position.set(lerp(1.0, 4.2, k), 0, lerp(-2.3, -2.6, k));
        c.pose.lie = 0;
        c.moving = true;
        c.look(4.2, -4.3, dt);
      } else {
        r.position.set(4.2, 0, -2.6);
        c.look(4.2, -4.3, dt);
      }
      // pega o copo, bebe a água, cospe na pia
      const cup = c.props['cup'];
      const mouth = c.at(0, 0.86, 0.2);
      if (p > 0.5 && p < 0.84) {
        const up = ease(seg(p, 0.5, 0.62)) * (1 - ease(seg(p, 0.72, 0.84)));
        cup.position.lerpVectors(c.state.cupFrom, mouth, up);
        c.reach('r', cup.getWorldPosition(new THREE.Vector3()), 1);
      }
      if (p > 0.55) c.once('gulp', () => c.audio.sfx('munch'));
      if (p > 0.86 && p < 0.97) {
        c.once('spit', () => c.say('Agora, cuspa na pia.'));
        c.every('sp', dt, 0.03, () => drop(c, mouth.x, mouth.y, mouth.z, rnd() * 0.3, 0.8, -1.8, 0.45));
      }
      if (p > 0.97)
        c.once('end', () => {
          c.fx.popup('😁', c.at(0, 1.3, 0.1), 1.6, 1.0);
          c.audio.sfx('sparkle');
        });
    },
    end(c) {
      c.lock(false);
      c.props['cup'].position.copy(c.state.cupFrom);
      c.pose.lie = 0;
    },
  },

  sticker: {
    duration: 5.5,
    start(c) {
      c.state.pick = Math.floor(Math.random() * 3);
      c.state.from = c.props['stk' + c.state.pick].position.clone();
    },
    update(c, p) {
      const sp = c.props['stk' + c.state.pick];
      if (!c.state.got) {
        c.reach('r', sp.getWorldPosition(new THREE.Vector3()), seg(p, 0.1, 0.3));
        fly(sp, c.state.from, c.at(0.15, 0.75, 0.2), ease(seg(p, 0.35, 0.7)), 0.5);
      }
      if (p >= 0.7)
        c.once('got', () => {
          c.state.got = true;
          c.root.attach(sp);
          sp.position.set(0.12 * c.H, 0.75 * c.H, 0.12 * c.H);
          c.audio.sfx('pop');
          c.fx.sparkle(c.at(0.15, 0.8, 0.2), 24);
        });
      if (p > 0.5) c.once('say', () => c.say('Parabéns, {nome}! Você foi muito corajoso!'));
      if (p > 0.85) c.once('end', () => c.fx.popup('🌟', c.at(0, 1.4, 0.1), 2, 1.2));
    },
  },

  // ================================================================ NOITE
  lightsOff: {
    duration: 3.4,
    update(c, p) {
      const sw = c.props['switch'];
      c.reach('r', V(0.9, 1.35, -4.75), ease(seg(p, 0.05, 0.25)) * (p < 0.6 ? 1 : 0));
      sw.rotation.x = -0.7 * ease(seg(p, 0.3, 0.45));
      if (p > 0.4) c.once('click', () => c.audio.sfx('close'));
      c.setLight(lerp(0.55, 0.2, ease(seg(p, 0.4, 0.9))));
      if (p > 0.5) c.once('moon', () => c.fx.popup('🌙', c.at(0, 1.4, 0.2), 2, 1.1));
    },
  },

  sleep: {
    duration: 6,
    ownsMove: true,
    start(c) {
      c.state.start = c.root.position.clone();
    },
    update(c, p, dt) {
      const target = V(-4.6, 0.98, -4.1 + c.H);
      const m = ease(seg(p, 0.05, 0.5));
      c.root.position.lerpVectors(c.state.start, target, m);
      c.root.position.y = lerp(0, 0.98, m) + Math.sin(Math.PI * m) * 0.3;
      c.pose.lie = (-Math.PI / 2) * m;
      if (p > 0.05) c.root.rotation.y += (0 - c.root.rotation.y) * (1 - Math.exp(-6 * dt));
      c.moving = p < 0.25;
      const cl = cloth(c);
      cl.params.raise = 0.45 * ease(seg(p, 0.5, 0.8)); // cobre a criança
      c.props['blanket'].position.y = 0.8;
      cl.update();
      if (p > 0.55) c.once('say', () => c.say('Boa noite, {nome}. Durma bem!'));
      if (p > 0.85) {
        c.props['zzz'].visible = true;
        c.setLight(lerp(0.2, 0.1, seg(p, 0.85, 1)));
      }
    },
    end(c) {
      c.lock(true);
      c.pose.lie = -Math.PI / 2;
      c.root.position.set(-4.6, 0.98, -4.1 + c.H);
      c.root.rotation.y = 0;
    },
  },
};