import { Injectable, computed, inject, signal } from '@angular/core';
import { ROOMS } from '../scenes/rooms';
import { ProgressService } from './progress.service';

const XP_STEP = 10;
const XP_ROOM_BONUS = 20;
const XP_PER_LEVEL = 100;
const NAME_KEY = 'runtinetea.nome';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export type Screen = 'start' | 'map' | 'story' | 'play' | 'end';

@Injectable({ providedIn: 'root' })
export class RoutineService {
  private progress = inject(ProgressService);

  readonly childName = signal(loadName());
  /** Qual tela está aberta */
  readonly screen = signal<Screen>('start');
  readonly started = computed(() => this.screen() === 'play');
  readonly calmOpen = signal(false);
  readonly settingsOpen = signal(false);
  /** o jogo congela enquanto o cantinho da calma ou os ajustes estão abertos */
  readonly paused = computed(() => this.calmOpen() || this.settingsOpen());
  readonly moodAsked = signal(false);

  /** índice da fase atual (nome antigo mantido: roomIndex) */
  readonly roomIndex = signal(0);
  readonly done = signal<boolean[]>([]);
  readonly xp = signal(0);
  readonly roomDone = signal(false);
  readonly lastGain = signal(0);
  readonly helps = signal(0); // pedidos de ajuda nesta fase (repetir/mostre-me)
  readonly startedAt = signal(0);

  readonly busy = signal(false);
  readonly progressBar = signal(0);
  readonly sleeping = signal(false);

  readonly room = computed(() => ROOMS[this.roomIndex()]);
  readonly level = computed(() => 1 + Math.floor(this.xp() / XP_PER_LEVEL));

  /** Ordem livre: a criança escolhe (só nas fases em que as etapas são independentes) */
  readonly freeMode = computed(() => this.progress.settings().freeOrder && !!this.room().free);

  readonly remaining = computed(() => this.done().map((d, i) => (d ? -1 : i)).filter((i) => i >= 0));
  /** etapas que podem ser feitas agora */
  readonly candidates = computed(() => {
    const r = this.remaining();
    return this.freeMode() ? r : r.slice(0, 1);
  });
  readonly stepIndex = computed(() => this.remaining()[0] ?? this.room().steps.length);

  /** AGORA (nulo quando a criança pode escolher) */
  readonly now = computed(() => {
    const c = this.candidates();
    return c.length === 1 ? this.room().steps[c[0]] : null;
  });

  /** DEPOIS */
  readonly next = computed(() => {
    const r = this.remaining();
    const s = this.room().steps[r[this.freeMode() ? 99 : 1]];
    return s ? { icon: s.icon, label: s.label } : { icon: '🏆', label: 'Fim da fase!' };
  });

  setName(name: string): void {
    const n = name.trim();
    this.childName.set(n);
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignora */
    }
  }

  /** Começa (ou recomeça) uma fase */
  enter(index: number): void {
    this.roomIndex.set(index);
    this.done.set(ROOMS[index].steps.map(() => false));
    this.roomDone.set(false);
    this.helps.set(0);
    this.busy.set(false);
    this.progressBar.set(0);
    this.startedAt.set(Date.now());
  }

  /** Conclui a etapa i. Retorna true se a fase terminou. */
  completeStep(i: number): boolean {
    this.done.update((d) => d.map((v, k) => (k === i ? true : v)));
    this.xp.update((v) => v + XP_STEP);
    if (this.remaining().length > 0) return false;
    this.xp.update((v) => v + XP_ROOM_BONUS);
    this.lastGain.set(XP_STEP + XP_ROOM_BONUS);
    this.roomDone.set(true);
    return true;
  }
}