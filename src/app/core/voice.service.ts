import { Injectable, NgZone, signal } from '@angular/core';
import { AudioService } from './audio.service';

/**
 * Narrador: lê em voz alta (pt-BR) o que a criança deve fazer.
 * Usa a voz do próprio aparelho (Web Speech), então não precisa de arquivos de áudio.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  readonly enabled = signal(true);
  readonly speaking = signal(false);
  private voice?: SpeechSynthesisVoice;

  constructor(private audio: AudioService, private ngZone: NgZone) {
    if (this.supported()) {
      this.pickVoice();
      speechSynthesis.onvoiceschanged = () => this.pickVoice();
    }
  }

  private supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private pickVoice(): void {
    const voices = speechSynthesis.getVoices();
    const pt = voices.filter((v) => /^pt/i.test(v.lang));
    const prefer = /luciana|francisca|maria|vit[oó]ria|helena|camila|google.*portugu/i;
    this.voice =
      pt.find((v) => /pt[-_]BR/i.test(v.lang) && prefer.test(v.name)) ??
      pt.find((v) => /pt[-_]BR/i.test(v.lang)) ??
      pt[0];
  }

  /** interrupt = true: corta a fala atual. false: entra na fila. */
  speak(text: string, interrupt = true): void {
    if (!this.enabled() || !this.supported() || !text.trim()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    if (this.voice) u.voice = this.voice;
    u.rate = 0.9; // um pouco mais devagar
    u.pitch = 1.15;
    u.volume = 1;
    u.onstart = () => this.ngZone.run(() => {
      this.speaking.set(true);
      this.audio.duck(true);
    });
    const end = () => window.setTimeout(() => {
      if (speechSynthesis.speaking || speechSynthesis.pending) return;
      this.ngZone.run(() => {
        this.speaking.set(false);
        this.audio.duck(false);
      });
    }, 60);
    u.onend = end;
    u.onerror = end;

    if (interrupt && (speechSynthesis.speaking || speechSynthesis.pending)) {
      speechSynthesis.cancel();
      window.setTimeout(() => speechSynthesis.speak(u), 90);
    } else {
      speechSynthesis.speak(u);
    }
  }

  cancel(): void {
    if (this.supported()) speechSynthesis.cancel();
  }

  toggle(): void {
    const on = !this.enabled();
    this.enabled.set(on);
    if (!on) this.cancel();
  }
}