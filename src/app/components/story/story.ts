import { Component, inject, signal } from '@angular/core';
import { RoutineService } from '../../core/routine.service';
import { GameEngineService } from '../../core/game-engine';
import { VoiceService } from '../../core/voice.service';

/** História social: mostra e lê, em poucas figuras, o que vai acontecer na fase (previsibilidade). */
@Component({
  selector: 'app-story',
  standalone: true,
  templateUrl: './story.html',
  styleUrl: './story.scss'
})
export class StoryComponent {
  routine = inject(RoutineService);
  private engine = inject(GameEngineService);
  private voice = inject(VoiceService);

  page = signal(0);

  constructor() {
    this.read();
  }

  pages() {
    return this.routine.room().story;
  }

  read(): void {
    const p = this.pages()[this.page()];
    if (p) this.voice.speak(p.text);
  }

  next(): void {
    if (this.page() >= this.pages().length - 1) {
      this.engine.playLevel();
      return;
    }
    this.page.update((v) => v + 1);
    this.read();
  }

  skip(): void {
    this.engine.playLevel();
  }

  back(): void {
    this.engine.goMap();
  }
}