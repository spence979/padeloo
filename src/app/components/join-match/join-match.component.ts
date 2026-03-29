import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { PlayerService } from '../../services/player.service';
import { SharedMatchService, PlayerPosition } from '../../services/shared-match.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-join-match',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './join-match.component.html',
  styleUrl: './join-match.component.scss'
})
export class JoinMatchComponent implements OnInit, OnDestroy {
  @ViewChild('scannerVideo') scannerVideoEl?: ElementRef<HTMLVideoElement>;

  matchId = signal<string | null>(null);
  matchData = signal<any>(null);
  selectedPosition = signal<PlayerPosition | null>(null);

  showScanner = signal(false);
  scanError = signal('');
  loading = signal(false);
  error = signal('');

  private codeReader: BrowserMultiFormatReader | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public playerService: PlayerService,
    public sharedMatchService: SharedMatchService,
    private authService: AuthService
  ) {}

  // Auth users have id === uid, so identity is always resolvable from the auth token
  get myPlayerId(): string {
    return this.authService.user()?.uid ?? '';
  }

  get myPlayerName(): string {
    return this.playerService.getById(this.myPlayerId)?.name
      ?? this.authService.user()?.displayName
      ?? '';
  }

  ngOnInit(): void {
    // Check if match ID is provided in query params
    this.route.queryParams.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadMatch(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.sharedMatchService.stopListening();
  }

  async loadMatch(matchId: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.matchId.set(matchId);

    try {
      // Listen to match data
      this.sharedMatchService.listenToMatch(matchId);

      // Subscribe to match data updates
      const matchData = this.sharedMatchService.sharedMatchData();
      if (matchData) {
        this.matchData.set(matchData);
      }
    } catch (err) {
      this.error.set('Failed to load match. Please try again.');
      console.error('Error loading match:', err);
    } finally {
      this.loading.set(false);
    }
  }

  // Get available positions (not yet filled)
  getAvailablePositions(): Array<{position: PlayerPosition; label: string}> {
    const data = this.sharedMatchService.sharedMatchData();
    if (!data) return [];

    const positions: Array<{position: PlayerPosition; label: string}> = [
      { position: 'team1Player1', label: 'Team 1 - Player 1' },
      { position: 'team1Player2', label: 'Team 1 - Player 2' },
      { position: 'team2Player1', label: 'Team 2 - Player 1' },
      { position: 'team2Player2', label: 'Team 2 - Player 2' }
    ];

    // Filter out positions that are already filled
    return positions.filter(p => !data[p.position] || data[p.position] === '');
  }

  // Get filled positions with player names
  getFilledPositions(): Array<{position: string; playerName: string}> {
    const data = this.sharedMatchService.sharedMatchData();
    if (!data) return [];

    const positions: Array<{position: string; label: string; key: PlayerPosition}> = [
      { position: 'Team 1 - Player 1', label: 'team1Player1', key: 'team1Player1' },
      { position: 'Team 1 - Player 2', label: 'team1Player2', key: 'team1Player2' },
      { position: 'Team 2 - Player 1', label: 'team2Player1', key: 'team2Player1' },
      { position: 'Team 2 - Player 2', label: 'team2Player2', key: 'team2Player2' }
    ];

    return positions
      .filter(p => data[p.key])
      .map(p => ({
        position: p.position,
        playerName: this.playerService.getById(data[p.key])?.name || 'Unknown Player'
      }));
  }

  selectPosition(position: PlayerPosition): void {
    this.selectedPosition.set(position);
  }

  async joinMatch(): Promise<void> {
    const position = this.selectedPosition();
    const playerId = this.myPlayerId;
    const matchId = this.matchId();

    if (!position || !playerId || !matchId) {
      this.error.set('Please select a position and player.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.sharedMatchService.updatePlayerPosition(matchId, position, playerId);

      // Navigate back to setup screen or show success
      this.router.navigate(['/new-match'], {
        queryParams: { sharedMatchId: matchId }
      });
    } catch (err) {
      this.error.set('Failed to join match. Please try again.');
      console.error('Error joining match:', err);
    } finally {
      this.loading.set(false);
    }
  }

  // QR Scanner
  async startScanner(): Promise<void> {
    this.showScanner.set(true);
    this.scanError.set('');

    setTimeout(async () => {
      if (!this.scannerVideoEl?.nativeElement) {
        this.scanError.set('Camera element not ready');
        return;
      }

      try {
        this.codeReader = new BrowserMultiFormatReader();
        await this.codeReader.decodeFromVideoDevice(
          undefined, // Use default camera
          this.scannerVideoEl.nativeElement,
          (result, error) => {
            if (result) {
              const qrData = result.getText();
              this.handleQRCodeScanned(qrData);
            }
            if (error && !(error.name === 'NotFoundException')) {
              console.error('QR scan error:', error);
            }
          }
        );
      } catch (err) {
        this.scanError.set('Failed to access camera. Please check permissions.');
        console.error('Scanner error:', err);
        this.stopScanner();
      }
    }, 100);
  }

  stopScanner(): void {
    if (this.codeReader) {
      // Stop all video streams
      const video = this.scannerVideoEl?.nativeElement;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
      this.codeReader = null;
    }
    this.showScanner.set(false);
  }

  handleQRCodeScanned(qrData: string): void {
    this.stopScanner();

    try {
      // Parse the QR code data
      const url = new URL(qrData);
      const matchId = url.searchParams.get('id');

      if (matchId) {
        this.loadMatch(matchId);
      } else {
        this.scanError.set('Invalid QR code');
      }
    } catch (err) {
      this.scanError.set('Invalid QR code format');
    }
  }
}
