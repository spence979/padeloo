import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { VoiceCommand } from './voice.service';

const TRIGGER_KEYS = new Set(['Enter', ' ', 'AudioVolumeUp']);
const DOUBLE_CLICK_MS = 300;

@Injectable({ providedIn: 'root' })
export class BluetoothRemoteService {
  readonly isActive = signal(false);
  readonly command$ = new Subject<VoiceCommand>();

  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  start(): void {
    if (this.isActive()) return;
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler);
    this.isActive.set(true);
  }

  stop(): void {
    if (!this.isActive()) return;
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.isActive.set(false);
  }

  private onKey(e: KeyboardEvent): void {
    if (!TRIGGER_KEYS.has(e.key)) return;
    e.preventDefault();

    if (this.pendingTimer !== null) {
      // Second press within window → double click → point for team 2
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.command$.next({ type: 'point', team: 2 });
    } else {
      // First press → wait to see if a second follows
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.command$.next({ type: 'point', team: 1 });
      }, DOUBLE_CLICK_MS);
    }
  }
}
