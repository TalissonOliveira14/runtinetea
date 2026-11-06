import { Component, inject } from '@angular/core';
import { RoutineService } from '../../core/routine.service';

@Component({
  selector: 'app-hud',
  standalone: true,
  templateUrl: './hud.html',
  styleUrl: './hud.scss'
})
export class HudComponent {
  routine = inject(RoutineService);
}