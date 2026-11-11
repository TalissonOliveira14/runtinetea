import { Injectable, computed, signal } from '@angular/core';

export type MoodId = 'feliz' | 'calmo' | 'cansado' | 'triste' | 'bravo' | 'medo';

export interface Settings {
  music: boolean;
  sfx: boolean;
  voice: boolean;
  quality: 'auto' | 'alta' | 'leve';
  calmMotion: boolean; // menos brilhos e confete
  freeOrder: boolean; // criança escolhe a ordem (nas fases em que dá)
  topColor: number; // cor favorita da camisa (0 = padrão)
}

export interface LevelResult {
  stars: number;
  plays: number;
  helps: number; // quantas vezes pediu ajuda na última vez
  secs: number;
}

export interface Profile {
  avatar: 'menino' | 'menina';
  pets: string[];
  levels: Record<string, LevelResult>;
  stickers: string[];
  quizRight: number;
  quizWrong: number;
  prompt: number; // 3 = muita ajuda ... 0 = sozinho
  moods: { t: number; m: MoodId }[];
  streak: number;
  lastDay: string;
  totalSecs: number;
}

const KEY = 'runtinetea.v2';

const DEFAULT_SETTINGS: Settings = { music: true, sfx: true, voice: true, quality: 'auto', calmMotion: false, freeOrder: false, topColor: 0 };
const DEFAULT_PROFILE: Profile = {
  avatar: 'menino', pets: ['cachorro'], levels: {}, stickers: [], quizRight: 0, quizWrong: 0,
  prompt: 3, moods: [], streak: 0, lastDay: '', totalSecs: 0,
};

const today = () => new Date().toISOString().slice(0, 10);

/** Progresso salvo no aparelho (localStorage): estrelas, figurinhas, ajustes e relatório para os pais. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  readonly settings = signal<Settings>({ ...DEFAULT_SETTINGS });
  readonly profile = signal<Profile>({ ...DEFAULT_PROFILE, levels: {}, stickers: [], moods: [] });

  readonly totalStars = computed(() => Object.values(this.profile().levels).reduce((a, l) => a + l.stars, 0));

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.settings.set({ ...DEFAULT_SETTINGS, ...d.s });
        this.profile.set({ ...DEFAULT_PROFILE, ...d.p });
      }
    } catch {
      /* sem armazenamento: segue sem salvar */
    }
    this.touchDay();
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ s: this.settings(), p: this.profile() }));
    } catch {
      /* ignora */
    }
  }

  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.settings.update((s) => ({ ...s, [k]: v }));
    this.persist();
  }

  patchProfile(p: Partial<Profile>): void {
    this.profile.update((x) => ({ ...x, ...p }));
    this.persist();
  }

  stars(id: string): number {
    return this.profile().levels[id]?.stars ?? 0;
  }

  /** Fase liberada: a primeira sempre; as outras quando a anterior tem ao menos 1 estrela */
  unlocked(index: number, ids: string[]): boolean {
    return index === 0 || this.stars(ids[index - 1]) >= 1;
  }

  recordLevel(id: string, stars: number, helps: number, secs: number): void {
    const old = this.profile().levels[id];
    const best = Math.max(old?.stars ?? 0, stars);
    this.profile.update((p) => ({
      ...p,
      levels: { ...p.levels, [id]: { stars: best, plays: (old?.plays ?? 0) + 1, helps, secs } },
      totalSecs: p.totalSecs + secs,
    }));
    this.persist();
  }

  addSticker(id: string): boolean {
    if (this.profile().stickers.includes(id)) return false;
    this.profile.update((p) => ({ ...p, stickers: [...p.stickers, id] }));
    this.persist();
    return true;
  }

  logQuiz(right: boolean): void {
    this.profile.update((p) => ({ ...p, quizRight: p.quizRight + (right ? 1 : 0), quizWrong: p.quizWrong + (right ? 0 : 1) }));
    this.persist();
  }

  logMood(m: MoodId): void {
    this.profile.update((p) => ({ ...p, moods: [...p.moods.slice(-29), { t: Date.now(), m }] }));
    this.persist();
  }

  /** Ajuda que vai diminuindo (ou aumentando) conforme a criança vai bem */
  adjustPrompt(delta: number): void {
    this.profile.update((p) => ({ ...p, prompt: Math.max(0, Math.min(3, p.prompt + delta)) }));
    this.persist();
  }

  private touchDay(): void {
    const p = this.profile();
    const t = today();
    if (p.lastDay === t) return;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    this.profile.update((x) => ({ ...x, streak: x.lastDay === y ? x.streak + 1 : 1, lastDay: t }));
    this.persist();
  }

  reset(): void {
    this.profile.set({ ...DEFAULT_PROFILE, levels: {}, stickers: [], moods: [] });
    this.persist();
  }

  /** Texto do relatório para pais e terapeutas */
  report(name: string, levelNames: Record<string, string>): string {
    const p = this.profile();
    const lines = [`Relatório - ${name || 'criança'} (${new Date().toLocaleDateString('pt-BR')})`, ''];
    lines.push(`Sequência de dias: ${p.streak} | Estrelas: ${this.totalStars()} | Figurinhas: ${p.stickers.length}`);
    lines.push(`Tempo total jogado: ${Math.round(p.totalSecs / 60)} min`);
    const lv = ['Muita ajuda', 'Ajuda média', 'Pouca ajuda', 'Sozinho(a)'];
    lines.push(`Nível de ajuda atual: ${lv[3 - p.prompt]}`);
    const tot = p.quizRight + p.quizWrong;
    lines.push(`Desafios: ${p.quizRight} acertos em ${tot} tentativas${tot ? ` (${Math.round((p.quizRight / tot) * 100)}%)` : ''}`);
    lines.push('', 'Fases:');
    for (const [id, r] of Object.entries(p.levels)) {
      lines.push(`- ${levelNames[id] ?? id}: ${r.stars} estrela(s), jogou ${r.plays}x, pedidos de ajuda na última vez: ${r.helps}`);
    }
    lines.push('', 'Como estava se sentindo (últimos registros):');
    p.moods.slice(-7).forEach((m) => lines.push(`- ${new Date(m.t).toLocaleDateString('pt-BR')}: ${m.m}`));
    return lines.join('\n');
  }
}