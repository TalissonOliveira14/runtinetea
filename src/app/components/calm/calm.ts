import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RoutineService } from '../../core/routine.service';
import { VoiceService } from '../../core/voice.service';

/** Respiração guiada com uma bolinha que enche e esvazia (autorregulação). */
@Component({
  selector: 'app-calm',
  standalone: true,
  templateUrl: './calm.html',
  styleUrl: './calm.scss'
})
export class CalmComponent implements OnDestroy {
  private routine = inject(RoutineService);
  private voice = inject(VoiceService);

  text = signal('Vamos respirar juntos');
  scale = signal(0.6);
  dur = signal(1);
  done = signal(false);
  private timers: number[] = [];
  private alive = true;

  constructor() {
    this.voice.speak('Vamos respirar juntos. Siga a bolinha.');
    this.later(2500, () => this.cycle(0));
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(() => this.alive && fn(), ms));
  }

  private cycle(n: number): void {
    if (n >= 3) {
      this.text.set('Muito bem! Você está mais calmo.');
      this.voice.speak('Muito bem! Você está mais calmo.');
      this.done.set(true);
      return;
    }
    this.text.set('Respire fundo');
    this.dur.set(4);
    this.scale.set(1.25);
    this.voice.speak('Respire fundo.');
    this.later(4200, () => {
      this.text.set('Segure');
      this.later(1500, () => {
        this.text.set('Solte devagar');
        this.dur.set(6);
        this.scale.set(0.6);
        this.voice.speak('Solte devagar.');
        this.later(6200, () => this.cycle(n + 1));
      });
    });
  }

  close(): void {
    this.routine.calmOpen.set(false);
  }

  ngOnDestroy(): void {
    this.alive = false;
    this.timers.forEach((t) => clearTimeout(t));
    this.voice.cancel();
  }
}