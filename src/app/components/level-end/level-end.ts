import { Component, inject, signal } from '@angular/core';
import { RoutineService } from '../../core/routine.service';
import { ProgressService } from '../../core/progress.service';
import { GameEngineService } from '../../core/game-engine';
import { VoiceService } from '../../core/voice.service';
import { Question, questionsFor } from '../../core/quiz-bank';
import { ROOMS } from '../../scenes/rooms';

type Opt = Question['opts'][number];

/** Depois da fase: ganha figurinha, faz um desafio curto (aprendizado sem erro) e vê as estrelas. */
@Component({
  selector: 'app-level-end',
  standalone: true,
  templateUrl: './level-end.html',
  styleUrl: './level-end.scss'
})
export class LevelEndComponent {
  routine = inject(RoutineService);
  private progress = inject(ProgressService);
  private engine = inject(GameEngineService);
  private voice = inject(VoiceService);

  stage = signal<'win' | 'quiz' | 'final'>('win');
  qi = signal(0);
  stars = signal(0);
  newSticker = signal(false);
  wrongNow = signal(0);
  chosen = signal(-1);
  correctNow = signal(false);

  readonly level = this.routine.room();
  questions: Question[] = questionsFor(this.level.id, this.routine.childName());
  opts = signal<Opt[]>([]);
  private right = 0; // acertou de primeira
  private hasNext = this.routine.roomIndex() < ROOMS.length - 1;

  constructor() {
    this.newSticker.set(this.progress.addSticker(this.level.id));
    this.voice.speak(
      this.fmt(this.newSticker() ? 'Parabéns, {nome}! Você ganhou uma figurinha nova!' : 'Muito bem, {nome}! Você terminou a fase de novo!') +
        (this.questions.length ? ' Vamos fazer um desafio?' : '')
    );
    if (!this.questions.length) this.finish();
  }

  private fmt(t: string): string {
    return t.replace(/\{nome\}/g, this.routine.childName() || 'amiguinho');
  }

  get q(): Question {
    return this.questions[this.qi()];
  }

  startQuiz(): void {
    this.stage.set('quiz');
    this.loadQuestion();
  }

  skipQuiz(): void {
    this.finish();
  }

  private loadQuestion(): void {
    this.wrongNow.set(0);
    this.chosen.set(-1);
    this.correctNow.set(false);
    const list = [...this.q.opts];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.opts.set(list);
    this.hear();
  }

  hear(): void {
    this.voice.speak(this.q.say);
  }

  pick(o: Opt, i: number): void {
    if (this.correctNow()) return;
    this.chosen.set(i);
    if (o.correct) {
      this.correctNow.set(true);
      this.progress.logQuiz(true);
      if (this.wrongNow() === 0) this.right++;
      this.voice.speak(this.fmt(['Isso mesmo, {nome}!', 'Muito bem!', 'Você acertou!'][Math.floor(Math.random() * 3)]));
      window.setTimeout(() => this.nextQuestion(), 1800);
    } else {
      this.progress.logQuiz(false);
      this.wrongNow.update((v) => v + 1);
      // aprendizado sem erro: nada de "errou", só tentar de novo, com dica
      this.voice.speak(this.wrongNow() >= 2 ? this.q.hint : 'Quase! Tente de novo.');
    }
  }

  isHint(o: Opt): boolean {
    return this.wrongNow() >= 2 && !!o.correct;
  }

  private nextQuestion(): void {
    if (this.qi() + 1 >= this.questions.length) {
      this.finish();
      return;
    }
    this.qi.update((v) => v + 1);
    this.loadQuestion();
  }

  private finish(): void {
    const helps = this.routine.helps();
    let s = 1;
    if (helps <= 1) s++; // fez com pouca ajuda
    if (this.right >= 2) s++; // foi bem no desafio
    this.stars.set(s);
    const secs = Math.round((Date.now() - this.routine.startedAt()) / 1000);
    this.progress.recordLevel(this.level.id, s, helps, secs);
    // a ajuda vai diminuindo quando vai bem, e volta se precisar
    if (helps === 0) this.progress.adjustPrompt(-1);
    else if (helps >= 3) this.progress.adjustPrompt(1);
    this.stage.set('final');
    this.voice.speak(this.fmt(`Você ganhou ${s} ${s === 1 ? 'estrela' : 'estrelas'}, {nome}!`));
  }

  get canNext(): boolean {
    return this.hasNext && this.progress.unlocked(this.routine.roomIndex() + 1, ROOMS.map((r) => r.id));
  }

  next(): void {
    this.engine.startLevel(this.routine.roomIndex() + 1);
  }

  again(): void {
    this.engine.startLevel(this.routine.roomIndex());
  }

  map(): void {
    this.engine.goMap();
  }
}