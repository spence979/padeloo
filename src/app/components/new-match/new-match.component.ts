import { Component, signal, OnDestroy, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PlayerService } from '../../services/player.service';
import { VoiceService } from '../../services/voice.service';
import { MatchSetupService } from '../../services/match-setup.service';
import { SharedMatchService } from '../../services/shared-match.service';
import { QrCodeComponent } from '../qr-code/qr-code.component';

@Component({
  selector: 'app-new-match',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, QrCodeComponent],
  templateUrl: './new-match.component.html',
  styleUrl: './new-match.component.scss',
})
export class NewMatchComponent implements OnInit, OnDestroy {
  date = new Date().toISOString().split('T')[0];
  location = '';
  team1Player1 = '';
  team1Player2 = '';
  team2Player1 = '';
  team2Player2 = '';
  error = signal('');

  voiceStatus = signal<'idle' | 'listening' | 'unsupported'>('idle');
  lastCommand = signal('');

  // QR Code sharing
  qrCodeData = signal('');
  sharedMatchId = signal<string | null>(null);

  private voiceSub: Subscription | null = null;

  constructor(
    public playerService: PlayerService,
    private router: Router,
    private route: ActivatedRoute,
    public voiceService: VoiceService,
    private matchSetupService: MatchSetupService,
    private sharedMatchService: SharedMatchService
  ) {
    if (!voiceService.isSupported()) {
      this.voiceStatus.set('unsupported');
    }

    // Listen for remote updates to match data
    effect(() => {
      const matchData = this.sharedMatchService.sharedMatchData();
      if (matchData && this.sharedMatchId()) {
        // Update local state when remote players join
        this.team1Player1 = matchData.team1Player1 || this.team1Player1;
        this.team1Player2 = matchData.team1Player2 || this.team1Player2;
        this.team2Player1 = matchData.team2Player1 || this.team2Player1;
        this.team2Player2 = matchData.team2Player2 || this.team2Player2;
        this.date = matchData.date || this.date;
        this.location = matchData.location || this.location;
      }
    });
  }

  ngOnInit(): void {
    // Check if we're joining a shared match
    this.route.queryParams.subscribe(params => {
      const sharedMatchId = params['sharedMatchId'];
      if (sharedMatchId) {
        this.joinSharedMatch(sharedMatchId);
      } else {
        // Auto-create shared match for QR code
        this.createSharedMatch();
      }
    });
  }

  // Auto-create shared match on load
  private async createSharedMatch(): Promise<void> {
    try {
      const matchId = await this.sharedMatchService.createSharedMatch({
        date: this.date,
        location: this.location,
        team1Player1: this.team1Player1,
        team1Player2: this.team1Player2,
        team2Player1: this.team2Player1,
        team2Player2: this.team2Player2,
      });

      this.sharedMatchId.set(matchId);
      const qrData = this.sharedMatchService.getQRCodeData(matchId);
      this.qrCodeData.set(qrData);
    } catch (err) {
      console.error('Error creating shared match:', err);
    }
  }

  ngOnDestroy(): void {
    this.voiceService.stop();
    this.voiceSub?.unsubscribe();
    this.sharedMatchService.stopListening();
  }

  get selectedPlayers(): string[] {
    return [this.team1Player1, this.team1Player2, this.team2Player1, this.team2Player2].filter(Boolean);
  }

  get hasValidPlayers(): boolean {
    const selected = this.selectedPlayers;
    return selected.length === 4 && new Set(selected).size === 4;
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

  // --- Voice (limited to "Start Game" command) ---

  toggleVoice(): void {
    if (!this.voiceService.isSupported()) return;
    if (this.voiceService.isListening()) {
      this.voiceService.stop();
      this.voiceStatus.set('idle');
      this.voiceSub?.unsubscribe();
    } else {
      this.voiceService.start();
      this.voiceStatus.set('listening');
      this.voiceSub = this.voiceService.command$.subscribe(cmd => {
        // Only listen for "new-set" which we'll repurpose as "start game"
        if (cmd.type === 'new-set') {
          this.startGame();
        }
        this.lastCommand.set(this.voiceService.lastTranscript());
      });
    }
  }

  startGame(): void {
    this.error.set('');
    this.voiceService.stop();

    if (!this.team1Player1 || !this.team1Player2 || !this.team2Player1 || !this.team2Player2) {
      this.error.set('Please select all 4 players.');
      this.voiceService.speak('Please select all 4 players');
      return;
    }

    if (!this.hasValidPlayers) {
      this.error.set('Each player can only appear once.');
      this.voiceService.speak('Each player can only appear once');
      return;
    }

    // Clean up shared match if one exists
    if (this.sharedMatchId()) {
      this.sharedMatchService.deleteSharedMatch(this.sharedMatchId()!);
    }

    // Save setup data to service
    this.matchSetupService.setSetup({
      date: this.date,
      location: this.location,
      team1Player1: this.team1Player1,
      team1Player2: this.team1Player2,
      team2Player1: this.team2Player1,
      team2Player2: this.team2Player2,
    });

    // Navigate to scoring screen
    this.router.navigate(['/match-scoring']);
  }

  joinSharedMatch(matchId: string): void {
    this.sharedMatchId.set(matchId);
    this.sharedMatchService.listenToMatch(matchId);
  }

  // Update remote match when local changes are made
  async updateRemoteMatch(): Promise<void> {
    const matchId = this.sharedMatchId();
    if (!matchId) return;

    try {
      await this.sharedMatchService.updateMatchData(matchId, {
        date: this.date,
        location: this.location,
        team1Player1: this.team1Player1,
        team1Player2: this.team1Player2,
        team2Player1: this.team2Player1,
        team2Player2: this.team2Player2,
      } as any);
    } catch (err) {
      console.error('Error updating remote match:', err);
    }
  }
}
