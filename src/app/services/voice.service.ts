import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

// Web Speech API types not included in default TS lib
declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export type VoiceCommand =
  | { type: 'point'; team: 1 | 2 }
  | { type: 'undo' }
  | { type: 'score' }
  | { type: 'new-set' };

const COMMANDS: Array<{ patterns: RegExp[]; command: VoiceCommand }> = [
  {
    patterns: [
      /\b(point us|our point|we scored|point for us|us)\b/i,
      /\b(team one|team 1)\s*(point|scored|wins?)\b/i,
    ],
    command: { type: 'point', team: 1 },
  },
  {
    patterns: [
      /\b(point them|their point|they scored|point for them|them)\b/i,
      /\b(team two|team 2)\s*(point|scored|wins?)\b/i,
    ],
    command: { type: 'point', team: 2 },
  },
  {
    patterns: [/\b(undo|go back|undo (that|last|last point)|cancel)\b/i],
    command: { type: 'undo' },
  },
  {
    patterns: [/\b(what'?s? the score|current score|read the score|score\??)\b/i],
    command: { type: 'score' },
  },
  {
    patterns: [
      /\b(new (game|set)|next (game|set)|start (game|set))\b/i,
      /\b(start|begin|let'?s? start)\b/i,
    ],
    command: { type: 'new-set' },
  },
];

@Injectable({ providedIn: 'root' })
export class VoiceService {
  readonly isListening = signal(false);
  readonly lastTranscript = signal('');
  readonly isSupported = signal(false);

  readonly command$ = new Subject<VoiceCommand>();

  private recognition: SpeechRecognition | null = null;

  constructor() {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      this.isSupported.set(true);
      this.recognition = new SpeechRecognitionAPI();
      this.recognition!.continuous = true;
      this.recognition!.interimResults = false;
      this.recognition!.lang = 'en-US';
      this.setupListeners();
    }
  }

  start(): void {
    if (!this.recognition || this.isListening()) return;
    this.recognition.start();
    this.isListening.set(true);
  }

  stop(): void {
    if (!this.recognition || !this.isListening()) return;
    this.recognition.stop();
    this.isListening.set(false);
  }

  toggle(): void {
    this.isListening() ? this.stop() : this.start();
  }

  speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  private setupListeners(): void {
    this.recognition!.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      this.lastTranscript.set(transcript);
      const cmd = this.parseCommand(transcript);
      if (cmd) this.command$.next(cmd);
    };

    this.recognition!.onerror = () => {
      this.isListening.set(false);
    };

    this.recognition!.onend = () => {
      // Restart if still supposed to be listening (browser stops after silence)
      if (this.isListening()) {
        try {
          this.recognition!.start();
        } catch {
          this.isListening.set(false);
        }
      }
    };
  }

  private parseCommand(transcript: string): VoiceCommand | null {
    for (const { patterns, command } of COMMANDS) {
      if (patterns.some(p => p.test(transcript))) {
        return command;
      }
    }
    return null;
  }
}
