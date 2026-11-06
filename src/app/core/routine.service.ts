import { Injectable, computed, signal } from '@angular/core';
import { ROOMS } from '../scenes/rooms';

const XP_STEP = 10;
const XP_ROOM_BONUS = 20;
const XP_PER_LEVEL = 100;

@Injectable({ providedIn: 'root' })
export class RoutineService {
  readonly roomIndex = signal(0);
  readonly stepIndex = signal(0);
  readonly xp = signal(0);
  readonly roomDone = signal(false);
  readonly lastGain = signal(0); // XP ganho ao concluir a sala (para a tela de comemoração)

  readonly room = computed(() => ROOMS[this.roomIndex()]);
  readonly level = computed(() => 1 + Math.floor(this.xp() / XP_PER_LEVEL));

  /** AGORA */
  readonly now = computed(() => this.room().steps[this.stepIndex()] ?? null);

  /** DEPOIS: próxima etapa da sala, ou a próxima sala quando for a última etapa */
  readonly next = computed(() => {
    const step = this.room().steps[this.stepIndex() + 1];
    if (step) return { icon: step.icon, label: step.label };
    const nextRoom = ROOMS[(this.roomIndex() + 1) % ROOMS.length];
    return { icon: nextRoom.icon, label: `Ir para: ${nextRoom.name}` };
  });

  /** Conclui a etapa atual. Retorna true se a sala terminou. */
  completeStep(): boolean {
    this.xp.update((v) => v + XP_STEP);
    const last = this.stepIndex() >= this.room().steps.length - 1;
    if (!last) {
      this.stepIndex.update((v) => v + 1);
      return false;
    }
    this.xp.update((v) => v + XP_ROOM_BONUS);
    this.lastGain.set(XP_STEP + XP_ROOM_BONUS);
    this.roomDone.set(true);
    return true;
  }

  advanceRoom(): void {
    this.roomIndex.update((v) => (v + 1) % ROOMS.length);
    this.stepIndex.set(0);
    this.roomDone.set(false);
  }
}