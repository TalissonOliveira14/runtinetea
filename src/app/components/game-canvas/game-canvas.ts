import { Component, ElementRef, AfterViewInit, ViewChild, OnDestroy } from '@angular/core';
import { GameEngineService } from '../../core/game-engine';
import { RoutineService } from '../../core/routine.service';
import { HudComponent } from '../hud/hud';
import { JoystickComponent } from '../joystick/joystick';
import { StartScreenComponent } from '../start/start';
import { MapComponent } from '../map/map';
import { StoryComponent } from '../story/story';
import { LevelEndComponent } from '../level-end/level-end';
import { CalmComponent } from '../calm/calm';
import { SettingsComponent } from '../settings/settings';

@Component({
  selector: 'app-game-canvas',
  standalone: true,
  imports: [HudComponent, JoystickComponent, StartScreenComponent, MapComponent, StoryComponent, LevelEndComponent, CalmComponent, SettingsComponent],
  templateUrl: './game-canvas.html',
  styleUrl: './game-canvas.scss'
})
export class GameCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private gameEngine: GameEngineService, public routine: RoutineService) {}

  ngAfterViewInit(): void {
    this.gameEngine.initEngine(this.canvasRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.gameEngine.destroy();
  }
}