import { Component, ElementRef, AfterViewInit, ViewChild, OnDestroy } from '@angular/core';
import { GameEngineService, CharacterType } from '../../core/game-engine';
import { HudComponent } from '../hud/hud';
import { JoystickComponent } from '../joystick/joystick';

@Component({
  selector: 'app-game-canvas',
  standalone: true,
  imports: [HudComponent, JoystickComponent],
  templateUrl: './game-canvas.html',
  styleUrl: './game-canvas.scss'
})
export class GameCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private gameEngine: GameEngineService) {}

  ngAfterViewInit(): void {
    this.gameEngine.initEngine(this.canvasRef.nativeElement);
  }

  public changeChar(charType: CharacterType): void {
    this.gameEngine.selectCharacter(charType);
  }

  ngOnDestroy(): void {
    this.gameEngine.destroy();
  }
}