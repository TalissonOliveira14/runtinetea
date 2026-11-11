import { Component, inject, signal } from '@angular/core';
import { ROOMS, WORLDS } from '../../scenes/rooms';
import { RoutineService } from '../../core/routine.service';
import { ProgressService, MoodId } from '../../core/progress.service';
import { GameEngineService } from '../../core/game-engine';
import { VoiceService } from '../../core/voice.service';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrl: './map.scss'
})
export class MapComponent {
  routine = inject(RoutineService);
  progress = inject(ProgressService);
  private engine = inject(GameEngineService);
  private voice = inject(VoiceService);

  worlds = WORLDS;
  rooms = ROOMS;
  private ids = ROOMS.map((r) => r.id);
  moodOpen = signal(!this.routine.moodAsked());
  albumOpen = signal(false);

  moods: { id: MoodId; e: string; l: string }[] = [
    { id: 'feliz', e: '😀', l: 'Feliz' },
    { id: 'calmo', e: '😌', l: 'Calmo' },
    { id: 'cansado', e: '🥱', l: 'Cansado' },
    { id: 'triste', e: '😢', l: 'Triste' },
    { id: 'bravo', e: '😠', l: 'Bravo' },
    { id: 'medo', e: '😰', l: 'Com medo' },
  ];

  constructor() {
    if (this.moodOpen()) this.voice.speak(this.fmt('Oi, {nome}! Como você está se sentindo hoje? Toque na carinha.'));
  }

  private fmt(t: string): string {
    return t.replace(/\{nome\}/g, this.routine.childName() || 'amiguinho');
  }

  levelsOf(world: number): { r: (typeof ROOMS)[number]; i: number }[] {
    return ROOMS.map((r, i) => ({ r, i })).filter((x) => x.r.world === world);
  }

  unlocked(i: number): boolean {
    return this.progress.unlocked(i, this.ids);
  }

  stars(i: number): number {
    return this.progress.stars(ROOMS[i].id);
  }

  hasSticker(id: string): boolean {
    return this.progress.profile().stickers.includes(id);
  }

  play(i: number): void {
    if (!this.unlocked(i)) {
      this.voice.speak('Termine a fase anterior para abrir esta.');
      return;
    }
    this.engine.startLevel(i);
  }

  hear(text: string): void {
    this.voice.speak(this.fmt(text));
  }

  pickMood(m: MoodId): void {
    this.progress.logMood(m);
    this.routine.moodAsked.set(true);
    this.moodOpen.set(false);
    const say: Record<MoodId, string> = {
      feliz: 'Que bom que você está feliz, {nome}! Vamos jogar!',
      calmo: 'Que bom, {nome}! Vamos jogar com calma.',
      cansado: 'Tudo bem ficar cansado. Vamos com calma, no seu tempo.',
      triste: 'Eu estou aqui com você, {nome}. Vamos respirar juntos.',
      bravo: 'Tudo bem sentir raiva. Vamos respirar fundo juntos.',
      medo: 'Você está seguro, {nome}. Vamos respirar devagarzinho.',
    };
    this.voice.speak(this.fmt(say[m]));
    if (m === 'triste' || m === 'bravo' || m === 'medo') window.setTimeout(() => this.routine.calmOpen.set(true), 1800);
  }

  openCalm(): void {
    this.routine.calmOpen.set(true);
  }

  openSettings(): void {
    this.routine.settingsOpen.set(true);
  }
}