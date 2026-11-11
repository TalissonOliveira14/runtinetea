import * as THREE from 'three';
import type { ActionId } from './rooms';
import { emojiSprite } from './fx';
import { Action, ActionCtx, PetHandle, V, rnd, ease, seg, lerp, fly, makePack } from './action-kit';

/** Gira as rodas do ônibus conforme ele anda */
function spinWheels(bus: THREE.Object3D, dx: number): void {
  const wheels = bus.userData['wheels'] as THREE.Mesh[] | undefined;
  wheels?.forEach((w) => (w.rotation.y += dx / 0.45));
}

const TARGETS: [number, number][] = [[4.2, 2.2], [3.0, -0.3], [-4.2, 0.9]]; // onde a bola cai

export const OUT_ACTIONS: Partial<Record<ActionId, Action>> = {
  // ================================================================ RUA
  closeDoor: {
    duration: 3.6,
    update(c, p) {
      const door = c.props['houseDoor'];
      const handle = V(-6.6, 1.1, -3.5);
      c.reach('r', handle, p < 0.72 ? 1 : 0);
      door.rotation.y = -1.5 * (1 - ease(seg(p, 0.25, 0.65)));
      if (p > 0.65) c.once('close', () => c.audio.sfx('close'));
      if (p > 0.75)
        c.once('key', () => {
          c.fx.popup('🔑', c.at(0, 1.2, 0.2), 1.5, 0.9);
          c.fx.sparkle(V(-7, 1.2, -3.4), 14);
          c.audio.sfx('sparkle');
        });
    },
    end(c) {
      c.props['houseDoor'].rotation.y = 0;
    },
  },

  lookBoth: {
    duration: 7,
    update(c, p) {
      // olha para a direita, depois para a esquerda, depois para frente
      const off = -0.9 * Math.sin(Math.PI * seg(p, 0.08, 0.3)) + 0.9 * Math.sin(Math.PI * seg(p, 0.32, 0.55));
      c.root.rotation.y = c.faceYaw + off;
      c.once('eyes', () => c.fx.popup('👀', c.at(0, 1.3, 0.2), 2.5, 0.9));
      // passa um carro: é preciso esperar
      const car = c.props['car'];
      const k = seg(p, 0.2, 0.6);
      car.position.x = k > 0 && k < 1 ? lerp(25, -25, k) : 40;
      if (p > 0.2) c.once('honk', () => c.audio.sfx('honk'));
      if (p > 0.22) c.once('say1', () => c.say('Passou um carro! Espere ele passar.'));
      if (p > 0.72) c.once('say2', () => c.say('Agora a rua está livre.'));
      if (p > 0.85) c.once('ok', () => c.fx.popup('✅', c.at(0, 1.3, 0.2), 1.5, 0.9));
    },
  },

  waitBus: {
    duration: 7,
    update(c, p) {
      const bus = c.props['bus'];
      const door = c.props['busDoor'];
      const prevX = bus.position.x;
      const k = seg(p, 0.15, 0.75);
      bus.position.x = lerp(32, 7.5, 1 - Math.pow(1 - k, 2.2)); // chega devagarinho
      spinWheels(bus, prevX - bus.position.x);
      door.scale.x = lerp(1, 0.05, ease(seg(p, 0.82, 0.96)));
      // acena enquanto espera
      if (p > 0.05 && p < 0.55) c.reach('r', c.at(-0.28, 1.12 + 0.07 * Math.sin(c.time * 9), 0.1), 1);
      c.once('wave', () => c.fx.popup('👋', c.at(0, 1.4, 0.2), 1.6, 0.9));
      if (p > 0.1) c.once('honk', () => c.audio.sfx('honk'));
      if (p > 0.7) c.once('brake', () => c.audio.sfx('brake'));
      if (p > 0.84) c.once('open', () => c.audio.sfx('open'));
    },
    end(c) {
      const bus = c.props['bus'];
      bus.position.x = 7.5;
      c.props['busDoor'].scale.x = 0.05;
    },
  },

  boardBus: {
    duration: 7.4,
    ownsMove: true,
    start(c) {
      c.state.s0 = c.root.position.clone();
      const kid = emojiSprite('🧒', 0.9);
      kid.position.set(-1.2, 1.6, 1.34);
      kid.visible = false;
      c.props['bus'].add(kid);
      c.state.kid = kid;
    },
    update(c, _p, dt) {
      const t = c.time;
      const bus = c.props['bus'];
      const door = c.props['busDoor'];
      const r = c.root;
      const sw = (a: number, b: number) => ease(seg(t, a, b));
      const doorX = bus.position.x - 2.2;
      r.rotation.y = 0;
      c.moving = false;
      if (t < 1.1) {
        const k = sw(0, 1.1);
        r.position.set(lerp(c.state.s0.x, doorX, k), 0, lerp(c.state.s0.z, -0.3, k));
        c.moving = true;
      } else if (t < 2.0) {
        const k = sw(1.1, 2.0); // sobe os degraus
        r.position.set(doorX, 0.5 * k, lerp(-0.3, 0.6, k));
        c.moving = true;
        c.reach('r', V(doorX + 0.3, 1.0, 0.1), 1);
      }
      if (t >= 2.0)
        c.once('inside', () => {
          c.setVisible(false);
          (c.state.kid as THREE.Object3D).visible = true;
          c.audio.sfx('pop');
          c.say('Boa viagem!');
        });
      door.scale.x = t < 2.3 ? 0.05 : lerp(0.05, 1, sw(2.3, 2.9));
      if (t >= 2.4) c.once('close', () => c.audio.sfx('close'));
      if (t >= 3.0) {
        c.once('honk', () => c.audio.sfx('honk'));
        const s = seg(t, 3.0, 7.2);
        const prevX = bus.position.x;
        bus.position.x = 7.5 - 42 * s * s; // arranca e vai embora
        spinWheels(bus, prevX - bus.position.x);
      }
      void dt;
    },
    end(c) {
      c.setVisible(false); // continua no ônibus até chegar na escola
    },
  },

  // ================================================================ ESCOLA
  storePack: {
    duration: 4.2,
    start(c) {
      let pk = c.unwearBackpack();
      if (!pk) {
        pk = makePack();
        c.room.add(pk);
        pk.position.copy(c.at(0, 0.3, -0.3));
      }
      c.state.pk = pk;
      c.state.from = pk.position.clone();
    },
    update(c, p) {
      const pk = c.state.pk as THREE.Object3D;
      if (p < 0.3) {
        c.reach('l', c.at(0.2, 0.75, -0.2), 1);
        c.reach('r', c.at(-0.2, 0.75, -0.2), 1);
        c.pose.lean = 0.15;
        c.state.from = pk.position.clone();
      } else {
        const k = ease(seg(p, 0.3, 0.75));
        fly(pk, c.state.from, V(-5.95, 0.6, -1.5), k, 0.8);
        pk.rotation.y = lerp(0, Math.PI / 2, k);
        if (k < 1) c.reach('r', pk.getWorldPosition(new THREE.Vector3()).add(V(0, 0.4, 0)), 1);
      }
      if (p > 0.75)
        c.once('pop', () => {
          c.audio.sfx('pop');
          c.fx.sparkle(V(-5.95, 1.1, -1.5), 14);
        });
      if (p > 0.88) c.once('end', () => c.fx.popup('🎒', c.at(0, 1.3, 0.1), 1.5, 1.0));
    },
  },

  draw: {
    duration: 8.5,
    start(c) {
      const crayon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0xef4444 })
      );
      c.room.add(crayon);
      c.state.crayon = crayon;
    },
    update(c, p, dt) {
      const crayon = c.state.crayon as THREE.Mesh;
      const pieces = c.props['notebook'].userData['pieces'] as THREE.Object3D[];
      const pen = V(-1.0 + 0.22 * Math.sin(c.time * 5), 0.95, 0.8 + 0.15 * Math.cos(c.time * 4));
      c.reach('r', pen, 1);
      crayon.position.copy(pen).add(V(0, 0.07, 0));
      crayon.rotation.z = 0.5;
      c.pose.lean = 0.25;
      [0.12, 0.42, 0.7].forEach((at, i) => {
        const k = ease(seg(p, at, at + 0.14));
        pieces[i].visible = k > 0;
        pieces[i].scale.setScalar(Math.max(0.001, k));
      });
      (crayon.material as THREE.MeshStandardMaterial).color.setHex(p < 0.4 ? 0xfacc15 : p < 0.68 ? 0xef4444 : 0x22c55e);
      c.every('sc', dt, 0.22, () => c.audio.sfx('scrub'));
      if (p > 0.9)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('🎨', c.at(0, 1.3, 0.1), 1.8, 1.0);
        });
    },
    end(c) {
      (c.state.crayon as THREE.Mesh).removeFromParent();
    },
  },

  raiseHand: {
    duration: 6.5,
    update(c, p) {
      const teacher = c.props['teacher'];
      const up = ease(seg(p, 0.05, 0.2)) * (1 - ease(seg(p, 0.7, 0.85)));
      c.reach('r', c.at(-0.12, 1.28, 0.05), up);
      c.once('hand', () => c.fx.popup('🙋', c.at(0, 1.4, 0.2), 1.8, 1.0));
      if (p > 0.3) {
        // a professora vira e responde
        const yaw = Math.atan2(c.root.position.x - teacher.position.x, c.root.position.z - teacher.position.z);
        teacher.rotation.y += (yaw - teacher.rotation.y) * 0.1;
        c.once('talk', () => {
          c.say('Pois não, {nome}?');
          c.fx.popup('💬', teacher.position.clone().add(V(0, 2.4, 0)), 2.2, 1.0);
        });
      }
      if (p > 0.8) c.once('ok', () => c.fx.popup('👍', c.at(0, 1.3, 0.2), 1.4, 1.0));
    },
    end(c) {
      c.props['teacher'].rotation.y = Math.PI;
    },
  },

  lunch: {
    duration: 7,
    start(c) {
      c.state.from = c.props['sandwich'].position.clone();
    },
    update(c, p) {
      const H = c.H;
      c.props['lunchLid'].rotation.x = -1.9 * ease(seg(p, 0, 0.1));
      const sw = c.props['sandwich'];
      if (!c.state.held) {
        fly(sw, c.state.from, c.at(0, 0.55, 0.3), ease(seg(p, 0.12, 0.3)), 0.5);
        if (p >= 0.3)
          c.once('hold', () => {
            c.state.held = true;
            c.hold(sw);
            c.audio.sfx('pop');
          });
      } else if (!c.state.eaten) {
        let m = 0;
        for (let i = 0; i < 3; i++) {
          const s = 0.35 + 0.17 * i;
          m = Math.max(m, Math.sin(Math.PI * seg(p, s, s + 0.17)));
          if (p > s + 0.085)
            c.once('bite' + i, () => {
              sw.scale.multiplyScalar(0.75);
              c.audio.sfx('munch');
              const w = c.at(0, 0.86, 0.2);
              c.fx.spark.burst(w.x, w.y, w.z, 8, [0xfcd34d, 0xfef3c7], 1.5, 0.6);
            });
        }
        sw.position.set(0, lerp(0.55, 0.88, m) * H, lerp(0.3, 0.16, m) * H);
        c.pose.y = p > 0.35 && p < 0.88 ? Math.abs(Math.sin(c.time * 16)) * 0.03 : 0;
      }
      if (p > 0.92)
        c.once('gone', () => {
          c.discard();
          c.state.eaten = true;
          c.fx.popup('🧃', c.at(0, 1.3, 0.1), 1.8, 1.0);
          c.audio.sfx('sparkle');
        });
    },
  },

  // ================================================================ RECREIO
  fetch: {
    duration: 14.8,
    start(c) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
      ball.castShadow = true;
      c.room.add(ball);
      ball.position.copy(c.at(0.35, 0.1, 0.5));
      c.state.ball = ball;
      c.state.dog = c.pet();
      c.state.i = 0;
      c.state.st = 'grab';
      c.state.t = 0;
      c.state.cyc = 0;
    },
    update(c, _p, dt) {
      const s = c.state;
      const ball = s.ball as THREE.Mesh;
      const dog = s.dog as PetHandle | undefined;
      s.t += dt;
      s.cyc += dt;
      const kid = c.root.position;

      // o cachorro corre até (x,z); devolve true quando chegou
      const dogGo = (x: number, z: number, speed = 5.5): boolean => {
        if (!dog) return true;
        const d = dog.root.position;
        const dx = x - d.x;
        const dz = z - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.25) {
          dog.set(false);
          return true;
        }
        const st = Math.min(speed * dt, dist);
        d.x += (dx / dist) * st;
        d.z += (dz / dist) * st;
        dog.root.rotation.y = Math.atan2(dx, dz);
        dog.set(true, true);
        return false;
      };

      if (s.i >= 3) {
        dog?.set(false);
        return;
      }
      if (s.cyc > 4.9) {
        // segurança: nunca trava
        s.cyc = 0;
        s.i++;
        s.st = 'grab';
        s.t = 0;
        ball.position.copy(c.at(0.35, 0.1, 0.5));
        return;
      }

      switch (s.st) {
        case 'grab': {
          const hand = c.at(-0.28, 0.95, 0.15);
          ball.position.lerp(hand, 1 - Math.exp(-12 * dt));
          c.reach('r', hand, 1);
          c.pose.lean = -0.1;
          if (s.t > 0.8) {
            s.from = ball.position.clone();
            s.st = 'fly';
            s.t = 0;
            c.audio.sfx('whoosh');
          }
          break;
        }
        case 'fly': {
          const [tx, tz] = TARGETS[s.i];
          const k = Math.min(1, s.t / 0.9);
          fly(ball, s.from, V(tx, 0.18, tz), k, 2.4);
          c.reach('r', c.at(0.15, 1.05, 0.45), 1 - k);
          const arrived = s.t > 0.15 ? dogGo(tx, tz) : false;
          if (k >= 1 && arrived) {
            s.st = dog ? 'carry' : 'drop';
            s.t = 0;
            s.from = ball.position.clone();
          }
          break;
        }
        case 'carry': {
          const d = dog!.root.position;
          ball.position.set(d.x, 0.45, d.z);
          const home = c.at(0.3, 0, 0.95);
          if (dogGo(home.x, home.z)) {
            s.st = 'drop';
            s.t = 0;
            s.from = ball.position.clone();
            c.audio.sfx('bark');
          }
          break;
        }
        case 'drop': {
          fly(ball, s.from, c.at(0.35, 0.1, 0.5), Math.min(1, s.t / 0.5), 0.5);
          if (dog) {
            dog.set(false);
            dog.root.rotation.y = Math.atan2(kid.x - dog.root.position.x, kid.z - dog.root.position.z);
          }
          if (s.t > 0.5)
            c.once('heart' + s.i, () =>
              c.fx.popup('❤️', dog ? dog.root.position.clone().add(V(0, 1.2, 0)) : c.at(0, 1.3, 0.1), 1.4, 0.9)
            );
          if (s.t > 1.4) {
            s.i++;
            s.cyc = 0;
            s.st = 'grab';
            s.t = 0;
          }
          break;
        }
      }
    },
    end(c) {
      (c.state.ball as THREE.Mesh).removeFromParent();
      (c.state.dog as PetHandle | undefined)?.release();
    },
  },

  pet: {
    duration: 6,
    start(c) {
      c.state.dog = c.pet();
    },
    update(c, p, dt) {
      const dog = c.state.dog as PetHandle | undefined;
      c.pose.lean = 0.5 * ease(seg(p, 0.05, 0.25)) * (1 - ease(seg(p, 0.88, 1)));
      if (!dog) {
        c.every('h', dt, 0.8, () => c.fx.popup('❤️', c.at(0.3, 1.2, 0.5)));
        return;
      }
      const target = c.at(0.45, 0, 0.85);
      const d = dog.root.position;
      const dx = target.x - d.x;
      const dz = target.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const st = Math.min(5 * dt, dist);
        d.x += (dx / dist) * st;
        d.z += (dz / dist) * st;
        dog.root.rotation.y = Math.atan2(dx, dz);
        dog.set(true, true);
      } else {
        dog.set(false);
        dog.root.rotation.y = Math.atan2(c.root.position.x - d.x, c.root.position.z - d.z);
        dog.root.rotation.z = Math.sin(c.time * 11) * 0.12; // abana o corpo todo
      }
      if (dist < 0.45) c.reach('r', d.clone().add(V(Math.sin(c.time * 5) * 0.18, 0.7, 0)), 1);
      if (p > 0.2) c.every('h', dt, 0.7, () => c.fx.popup('❤️', d.clone().add(V(rnd() * 0.4, 1.1, 0)), 1.3, 0.8));
      if (p > 0.15) c.once('bark', () => c.audio.sfx('bark'));
      if (p > 0.5) c.once('say', () => c.say('Que fofinho! O cachorrinho adorou.'));
    },
    end(c) {
      const dog = c.state.dog as PetHandle | undefined;
      if (dog) {
        dog.root.rotation.z = 0;
        dog.release();
      }
    },
  },

  sandcastle: {
    duration: 7.5,
    update(c, p, dt) {
      const k = ease(seg(p, 0.1, 0.85));
      c.props['mound'].scale.setScalar(Math.max(0.001, k));
      c.pose.lean = 0.45;
      const top = V(-6, 0.2 + 0.6 * k, -2.0);
      const s = Math.sin(c.time * 7) * 0.2;
      c.reach('l', top.clone().add(V(0.3 + s, 0.05, 0.1)), 1);
      c.reach('r', top.clone().add(V(-0.3 - s, 0.05, -0.1)), 1);
      c.every('sd', dt, 0.1, () => {
        const q = c.at(rnd() * 0.5, 0.1, 0.8);
        c.fx.spark.emit(q.x, q.y + 0.1, q.z, rnd() * 0.8, 1.2, rnd() * 0.8, 0xf5d98a, 0.5);
      });
      c.every('sc', dt, 0.3, () => c.audio.sfx('scrub'));
      if (p > 0.88)
        c.once('end', () => {
          c.audio.sfx('sparkle');
          c.fx.popup('🏰', V(-6, 2.2, -2), 2, 1.3);
          c.fx.sparkle(V(-6, 1.2, -2), 24);
        });
    },
  },

  slide: {
    duration: 8.4,
    ownsMove: true,
    start(c) {
      c.state.s0 = c.root.position.clone();
    },
    update(c, _p, dt) {
      const t = c.time;
      const r = c.root;
      const TH = 0.548; // inclinação do escorregador
      const sw = (a: number, b: number) => ease(seg(t, a, b));
      c.moving = false;

      if (t < 0.8) {
        const k = sw(0, 0.8);
        r.position.set(lerp(c.state.s0.x, 3.5, k), 0, lerp(c.state.s0.z, -4.4, k));
        r.rotation.y = Math.PI / 2;
        c.moving = true;
      } else if (t < 3.0) {
        r.position.set(3.5, 2.25 * sw(0.8, 3.0), -4.4); // sobe a escada
        r.rotation.y = Math.PI / 2;
        c.moving = true;
        const w = Math.sin(t * 6) * 0.22;
        c.reach('l', c.at(0.2, 1.1 + w, 0.45), 1);
        c.reach('r', c.at(-0.2, 1.1 - w, 0.45), 1);
        c.pose.lean = 0.1;
        c.every('cl', dt, 0.35, () => c.audio.sfx('scrub'));
      } else if (t < 4.0) {
        const k = sw(3.0, 4.0);
        r.position.set(lerp(3.5, 5.0, k), 2.25, lerp(-4.4, -4.0, k));
        r.rotation.y = lerp(Math.PI / 2, 0, sw(3.4, 4.0));
        c.moving = k < 0.95;
      } else if (t < 4.6) {
        const k = sw(4.0, 4.6); // deita no escorregador
        r.position.set(5, 2.25 + 0.15 * k, -3.95);
        r.rotation.y = 0;
        c.pose.lie = (-Math.PI / 2 + TH) * k;
      } else if (t < 6.6) {
        const s = seg(t, 4.6, 6.6);
        const e = s * s; // vai ganhando velocidade
        r.position.set(5, 2.4 - 1.96 * e, -3.95 + 3.05 * e);
        r.rotation.y = 0;
        c.pose.lie = -Math.PI / 2 + TH;
        c.reach('l', c.at(0.25, 0.6, 0.15), 1);
        c.reach('r', c.at(-0.25, 0.6, 0.15), 1);
        c.once('sfx', () => c.audio.sfx('slide'));
      } else {
        const k = sw(6.6, 7.4); // levanta com um pulinho
        r.position.set(5, lerp(0.45, 0, k) + Math.sin(Math.PI * k) * 0.25, -0.9);
        r.rotation.y = 0;
        c.pose.lie = (-Math.PI / 2 + TH) * (1 - k);
        c.once('end', () => {
          c.fx.confetti(5, 1.2, -0.9, 60);
          c.audio.sfx('sparkle');
          c.fx.popup('😄', c.at(0, 1.4, 0.2), 1.8, 1.1);
        });
      }
    },
    end(c) {
      c.root.position.set(5, 0, -0.9);
      c.pose.lie = 0;
    },
  },
};

export type { ActionCtx };