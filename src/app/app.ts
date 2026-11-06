import { Component } from '@angular/core';
import { GameCanvasComponent } from './components/game-canvas/game-canvas';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GameCanvasComponent],
  template: `<app-game-canvas></app-game-canvas>`,
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'runtinetea';
}