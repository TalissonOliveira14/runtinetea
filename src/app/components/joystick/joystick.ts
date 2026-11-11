import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { GameEngineService } from '../../core/game-engine';

@Component({
  selector: 'app-joystick',
  standalone: true,
  templateUrl: './joystick.html',
  styleUrl: './joystick.scss'
})
export class JoystickComponent implements OnDestroy {
  @ViewChild('knob', { static: true }) knob!: ElementRef<HTMLElement>;

  private pointerId: number | null = null;
  private cx = 0;
  private cy = 0;
  private radius = 45;

  constructor(private engine: GameEngineService) {}

  onDown(e: PointerEvent): void {
    e.preventDefault();
    const base = e.currentTarget as HTMLElement;
    base.setPointerCapture(e.pointerId);
    const r = base.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.radius = r.width * 0.34; // acompanha o tamanho do joystick na tela
    this.pointerId = e.pointerId;
    this.onMove(e);
  }

  onMove(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx *= this.radius / d;
      dy *= this.radius / d;
    }
    this.knob.nativeElement.style.transform = `translate(${dx}px, ${dy}px)`;
    this.engine.setJoystick(dx / this.radius, dy / this.radius);
  }

  onUp(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    this.knob.nativeElement.style.transform = 'translate(0, 0)';
    this.engine.setJoystick(0, 0);
  }

  ngOnDestroy(): void {
    this.engine.setJoystick(0, 0);
  }
}