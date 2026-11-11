import { Component, inject, signal } from '@angular/core';
import { GameEngineService, CharacterType } from '../../core/game-engine';
import { RoutineService } from '../../core/routine.service';
import { ProgressService } from '../../core/progress.service';

@Component({
  selector: 'app-start',
  standalone: true,
  templateUrl: './start.html',
  styleUrl: './start.scss'
})
export class StartScreenComponent {
  private engine = inject(GameEngineService);
  private routine = inject(RoutineService);
  private progress = inject(ProgressService);

  name = signal(this.routine.childName());
  avatar = signal<CharacterType>(this.progress.profile().avatar);
  pets: { type: CharacterType; icon: string; label: string }[] = [
    { type: 'cachorro', icon: '🐶', label: 'Cão' },
    { type: 'gato', icon: '🐱', label: 'Gato' },
    { type: 'coelho', icon: '🐰', label: 'Coelho' },
    { type: 'panda', icon: '🐼', label: 'Panda' },
  ];

  choose(type: CharacterType): void {
    this.avatar.set(type);
    this.engine.selectCharacter(type);
  }

  petOn(type: CharacterType): boolean {
    return (this.engine.activePets() as CharacterType[]).includes(type);
  }

  togglePet(type: CharacterType): void {
    this.engine.selectCharacter(type);
  }

  canStart(): boolean {
    return this.name().trim().length > 0;
  }

  start(): void {
    if (!this.canStart()) return;
    this.routine.setName(this.name());
    this.progress.patchProfile({ avatar: this.avatar() as 'menino' | 'menina', pets: [...this.engine.activePets()] });
    this.engine.begin(); // libera o som e a voz e abre o mapa de fases
  }
}