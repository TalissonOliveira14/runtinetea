import { Component, inject } from '@angular/core';
import { RoutineService } from '../../core/routine.service';
import { VoiceService } from '../../core/voice.service';
import { GameEngineService } from '../../core/game-engine';

@Component({
  selector: 'app-hud',
  standalone: true,
  templateUrl: './hud.html',
  styleUrl: './hud.scss'
})
export class HudComponent {
  routine = inject(RoutineService);
  voice = inject(VoiceService);
  private engine = inject(GameEngineService);

  repeat(): void {
    this.engine.repeatInstruction();
  }
  demo(): void {
    this.engine.demo();
  }
  map(): void {
    this.engine.goMap();
  }
  calm(): void {
    this.routine.calmOpen.set(true);
  }
  settings(): void {
    this.routine.settingsOpen.set(true);
  }
  /** Tocar num ícone da agenda: a voz diz o nome (ajuda quem ainda não lê) */
  say(label: string): void {
    this.voice.speak(label);
  }
  isDone(i: number): boolean {
    return this.routine.done()[i] ?? false;
  }
  isCurrent(i: number): boolean {
    return this.routine.candidates().includes(i) && !this.routine.roomDone();
  }
}