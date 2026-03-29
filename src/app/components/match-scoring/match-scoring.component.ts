import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PlayerService } from '../../services/player.service';
import { MatchService } from '../../services/match.service';
import { VoiceService } from '../../services/voice.service';
import { GestureService } from '../../services/gesture.service';
import { BluetoothRemoteService } from '../../services/bluetooth-remote.service';
import { MatchSetupService } from '../../services/match-setup.service';
import { SetScore } from '../../models/match.model';

interface MatchState {
  points: { team1: number; team2: number };
  currentSet: { team1: number; team2: number };
  completedSets: SetScore[];
  isInTiebreak: boolean;
  isMatchOver: boolean;
  winner: 1 | 2 | undefined;
}

@Component({
  selector: 'app-match-scoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-scoring.component.html',
  styleUrl: './match-scoring.component.scss',
})
export class MatchScoringComponent implements OnInit, OnDestroy {
  @ViewChild('cameraVideo') cameraVideoEl?: ElementRef<HTMLVideoElement>;

  // Match setup
  date = '';
  location = '';
  team1Player1 = '';
  team1Player2 = '';
  team2Player1 = '';
  team2Player2 = '';

  state: MatchState = this.freshState();
  stateHistory: MatchState[] = [];

  lastCommand = signal('');
  showCameraOverlay = signal(false);
  cameraError = signal('');

  private voiceSub: Subscription | null = null;
  private gestureSub: Subscription | null = null;
  private remoteSub: Subscription | null = null;

  constructor(
    public playerService: PlayerService,
    private matchService: MatchService,
    private router: Router,
    public voiceService: VoiceService,
    public gestureService: GestureService,
    public bluetoothRemoteService: BluetoothRemoteService,
    private matchSetupService: MatchSetupService
  ) {}

  ngOnInit(): void {
    const setup = this.matchSetupService.getSetup();
    if (!setup) {
      // No setup data, redirect back to new-match
      this.router.navigate(['/new-match']);
      return;
    }

    // Load setup data
    this.date = setup.date;
    this.location = setup.location;
    this.team1Player1 = setup.team1Player1;
    this.team1Player2 = setup.team1Player2;
    this.team2Player1 = setup.team2Player1;
    this.team2Player2 = setup.team2Player2;

    // Auto-start voice recognition
    if (this.voiceService.isSupported()) {
      this.startVoice();
    }

    // Auto-start Bluetooth remote listener
    this.bluetoothRemoteService.start();
    this.remoteSub = this.bluetoothRemoteService.command$.subscribe(cmd => {
      if (cmd.type === 'point') this.addPoint(cmd.team);
    });
  }

  ngOnDestroy(): void {
    this.voiceService.stop();
    this.voiceSub?.unsubscribe();
    this.gestureService.stop();
    this.gestureSub?.unsubscribe();
    this.bluetoothRemoteService.stop();
    this.remoteSub?.unsubscribe();
  }

  private freshState(): MatchState {
    return {
      points: { team1: 0, team2: 0 },
      currentSet: { team1: 0, team2: 0 },
      completedSets: [],
      isInTiebreak: false,
      isMatchOver: false,
      winner: undefined,
    };
  }

  // --- Display helpers ---

  get pointDisplay(): { team1: string; team2: string } {
    const { team1, team2 } = this.state.points;
    if (this.state.isInTiebreak) {
      return { team1: team1.toString(), team2: team2.toString() };
    }
    const labels = ['0', '15', '30', '40'];
    if (team1 >= 3 && team2 >= 3) {
      if (team1 === team2) return { team1: '40', team2: '40' };
      return team1 > team2 ? { team1: 'Ad', team2: '40' } : { team1: '40', team2: 'Ad' };
    }
    return { team1: labels[Math.min(team1, 3)], team2: labels[Math.min(team2, 3)] };
  }

  get isDeuce(): boolean {
    const { team1, team2 } = this.state.points;
    return !this.state.isInTiebreak && team1 >= 3 && team2 >= 3 && team1 === team2;
  }

  get setsWon(): { team1: number; team2: number } {
    return {
      team1: this.state.completedSets.filter(s => s.team1 > s.team2).length,
      team2: this.state.completedSets.filter(s => s.team2 > s.team1).length,
    };
  }

  get currentSetLabel(): string {
    if (this.state.isMatchOver) return 'Match Complete';
    if (this.state.isInTiebreak) return 'Tiebreak';
    return `Set ${this.state.completedSets.length + 1}`;
  }

  get team1Label(): string {
    const names = [this.team1Player1, this.team1Player2]
      .filter(Boolean)
      .map(id => this.playerService.getById(id)?.name ?? '?');
    return names.length ? names.join(' & ') : 'Team 1';
  }

  get team2Label(): string {
    const names = [this.team2Player1, this.team2Player2]
      .filter(Boolean)
      .map(id => this.playerService.getById(id)?.name ?? '?');
    return names.length ? names.join(' & ') : 'Team 2';
  }

  // --- Scoring engine ---

  addPoint(team: 1 | 2): void {
    if (this.state.isMatchOver) return;
    this.stateHistory.push(JSON.parse(JSON.stringify(this.state)));
    if (team === 1) this.state.points.team1++;
    else this.state.points.team2++;
    const gameWinner = this.checkGameWon();
    if (gameWinner) this.handleGameWon(gameWinner);
    this.announceScore();
  }

  undoPoint(): void {
    const prev = this.stateHistory.pop();
    if (prev) {
      this.state = prev;
      this.announceScore();
    } else {
      this.voiceService.speak('Nothing to undo');
    }
  }

  private checkGameWon(): 1 | 2 | null {
    const { team1, team2 } = this.state.points;
    if (this.state.isInTiebreak) {
      if (team1 >= 7 && team1 - team2 >= 2) return 1;
      if (team2 >= 7 && team2 - team1 >= 2) return 2;
      return null;
    }
    if (team1 >= 4 && team1 - team2 >= 2) return 1;
    if (team2 >= 4 && team2 - team1 >= 2) return 2;
    return null;
  }

  private handleGameWon(winner: 1 | 2): void {
    if (winner === 1) this.state.currentSet.team1++;
    else this.state.currentSet.team2++;
    this.state.points = { team1: 0, team2: 0 };
    this.state.isInTiebreak = false;
    const setWinner = this.checkSetWon();
    if (setWinner) {
      this.handleSetWon(setWinner);
    } else if (this.state.currentSet.team1 === 6 && this.state.currentSet.team2 === 6) {
      this.state.isInTiebreak = true;
    }
  }

  private checkSetWon(): 1 | 2 | null {
    const { team1, team2 } = this.state.currentSet;
    if (team1 >= 6 && team1 - team2 >= 2 && team2 <= 4) return 1;
    if (team2 >= 6 && team2 - team1 >= 2 && team1 <= 4) return 2;
    if (team1 === 7 && team2 === 5) return 1;
    if (team2 === 7 && team1 === 5) return 2;
    if (team1 === 7 && team2 === 6) return 1;
    if (team2 === 7 && team1 === 6) return 2;
    return null;
  }

  private handleSetWon(winner: 1 | 2): void {
    this.state.completedSets.push({ ...this.state.currentSet });
    this.state.currentSet = { team1: 0, team2: 0 };
    const won1 = this.state.completedSets.filter(s => s.team1 > s.team2).length;
    const won2 = this.state.completedSets.filter(s => s.team2 > s.team1).length;
    if (won1 >= 2 || won2 >= 2) {
      this.state.isMatchOver = true;
      this.state.winner = won1 >= 2 ? 1 : 2;
    }
  }

  announceScore(): void {
    const pointDisplay = this.pointDisplay;
    let scoreText = '';

    if (this.isDeuce) {
      scoreText = 'deuce';
    } else {
      const team1Text = this.pointToSpeech(pointDisplay.team1);
      const team2Text = this.pointToSpeech(pointDisplay.team2);

      if (pointDisplay.team1 === 'Ad') {
        scoreText = `advantage ${this.team1Label}`;
      } else if (pointDisplay.team2 === 'Ad') {
        scoreText = `advantage ${this.team2Label}`;
      } else {
        scoreText = `${team1Text} ${team2Text}`;
      }
    }

    const games = this.state.currentSet;
    const suffix = this.state.isInTiebreak
      ? `tiebreak ${games.team1} ${games.team2}`
      : `game ${games.team1} ${games.team2}`;

    this.voiceService.speak(`${scoreText}, ${suffix}`);
  }

  private pointToSpeech(point: string): string {
    const map: { [key: string]: string } = {
      '0': 'love',
      '15': 'fifteen',
      '30': 'thirty',
      '40': 'forty',
      'Ad': 'advantage'
    };
    return map[point] || point;
  }

  // --- Voice ---

  private startVoice(): void {
    if (!this.voiceService.isSupported() || this.voiceService.isListening()) return;
    this.voiceService.start();
    this.voiceSub = this.voiceService.command$.subscribe(cmd => {
      switch (cmd.type) {
        case 'point': this.addPoint(cmd.team); break;
        case 'undo': this.undoPoint(); break;
        case 'score': this.announceScore(); break;
        case 'new-set': this.announceScore(); break;
      }
      this.lastCommand.set(this.voiceService.lastTranscript());
    });
  }

  toggleVoice(): void {
    if (!this.voiceService.isSupported()) return;
    if (this.voiceService.isListening()) {
      this.voiceService.stop();
      this.voiceSub?.unsubscribe();
    } else {
      this.startVoice();
    }
  }

  // --- Camera / Gesture ---

  async toggleCamera(): Promise<void> {
    if (!this.gestureService.isSupported()) return;
    if (this.showCameraOverlay()) {
      this.gestureService.stop();
      this.gestureSub?.unsubscribe();
      this.showCameraOverlay.set(false);
      this.cameraError.set('');
    } else {
      this.showCameraOverlay.set(true);
      this.cameraError.set('');
      setTimeout(async () => {
        if (!this.cameraVideoEl?.nativeElement) return;
        try {
          await this.gestureService.start(this.cameraVideoEl.nativeElement);
          this.gestureSub = this.gestureService.command$.subscribe(cmd => {
            if (cmd.type === 'point') this.addPoint(cmd.team);
            else if (cmd.type === 'undo') this.undoPoint();
          });
        } catch {
          this.cameraError.set('Camera access denied or unavailable.');
          this.showCameraOverlay.set(false);
        }
      }, 50);
    }
  }

  // --- Save & Exit ---

  get allSets(): SetScore[] {
    return [...this.state.completedSets, { ...this.state.currentSet }];
  }

  saveMatch(): void {
    this.voiceService.stop();
    this.gestureService.stop();
    this.matchService.add({
      date: this.date,
      location: this.location || undefined,
      team1: [this.team1Player1, this.team1Player2],
      team2: [this.team2Player1, this.team2Player2],
      sets: this.allSets,
    });
    this.matchSetupService.clearSetup();
    this.router.navigate(['/history']);
  }

  cancelMatch(): void {
    this.voiceService.stop();
    this.gestureService.stop();
    this.matchSetupService.clearSetup();
    this.router.navigate(['/new-match']);
  }
}
