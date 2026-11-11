import { Component, inject, signal } from '@angular/core';
import { RoutineService } from '../../core/routine.service';
import { ProgressService, Settings } from '../../core/progress.service';
import { AudioService } from '../../core/audio.service';
import { VoiceService } from '../../core/voice.service';
import { GameEngineService, CharacterType } from '../../core/game-engine';
import { ROOMS } from '../../scenes/rooms';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class SettingsComponent {
  routine = inject(RoutineService);
  progress = inject(ProgressService);
  audio = inject(AudioService);
  voice = inject(VoiceService);
  engine = inject(GameEngineService);

  // Painel dos pais: protegido por uma conta (a criança pequena não passa)
  parentOpen = signal(false);
  private a = 6 + Math.floor(Math.random() * 4);
  private b = 6 + Math.floor(Math.random() * 4);
  question = `${this.a} × ${this.b}`;
  answer = signal('');
  report = signal('');
  copied = signal(false);
  confirmReset = signal(false);

  colors = [0, 0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x06b6d4, 0xa855f7, 0xec4899];
  pets: { type: CharacterType; icon: string }[] = [
    { type: 'cachorro', icon: '🐶' },
    { type: 'gato', icon: '🐱' },
    { type: 'coelho', icon: '🐰' },
    { type: 'panda', icon: '🐼' },
  ];
  canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  get s(): Settings {
    return this.progress.settings();
  }

  hex(c: number): string {
    return c ? '#' + c.toString(16).padStart(6, '0') : 'conic-gradient(#ef4444, #facc15, #22c55e, #3b82f6, #ef4444)';
  }

  toggleMusic(): void {
    this.audio.toggleMusic();
    this.progress.setSetting('music', this.audio.musicOn());
  }
  toggleSfx(): void {
    this.audio.toggleSfx();
    this.progress.setSetting('sfx', this.audio.sfxOn());
  }
  toggleVoice(): void {
    this.voice.toggle();
    this.progress.setSetting('voice', this.voice.enabled());
  }
  toggle(key: 'calmMotion' | 'freeOrder'): void {
    this.progress.setSetting(key, !this.s[key]);
    this.engine.applySettings();
  }
  quality(q: Settings['quality']): void {
    this.progress.setSetting('quality', q);
    this.engine.applySettings();
  }
  color(c: number): void {
    this.progress.setSetting('topColor', c);
    this.engine.applySettings();
  }
  avatar(t: 'menino' | 'menina'): void {
    this.engine.selectCharacter(t);
    this.progress.patchProfile({ avatar: t });
  }
  petOn(t: CharacterType): boolean {
    return (this.engine.activePets() as CharacterType[]).includes(t);
  }
  pet(t: CharacterType): void {
    this.engine.selectCharacter(t);
    this.progress.patchProfile({ pets: [...this.engine.activePets()] });
  }
  fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  close(): void {
    this.routine.settingsOpen.set(false);
  }
  goMap(): void {
    this.close();
    this.engine.goMap();
  }

  unlockParents(): void {
    if (Number(this.answer()) !== this.a * this.b) {
      this.answer.set('');
      return;
    }
    const names: Record<string, string> = {};
    ROOMS.forEach((r) => (names[r.id] = r.name));
    this.report.set(this.progress.report(this.routine.childName(), names));
    this.parentOpen.set(true);
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.report());
      this.copied.set(true);
    } catch {
      /* sem permissão: o texto está na tela para copiar à mão */
    }
  }

  reset(): void {
    if (!this.confirmReset()) {
      this.confirmReset.set(true);
      return;
    }
    this.progress.reset();
    this.confirmReset.set(false);
    this.parentOpen.set(false);
  }
}