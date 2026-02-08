import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatchService } from '../../services/match.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  constructor(
    public matchService: MatchService,
    public playerService: PlayerService,
    public auth: AuthService
  ) {}

  get totalMatches(): number {
    return this.matchService.matches().length;
  }

  get totalPlayers(): number {
    return this.playerService.players().length;
  }

  get topPlayer(): { name: string; winPct: number } | null {
    const players = this.playerService.players();
    if (players.length === 0) return null;

    let best = { name: '', winPct: -1 };
    for (const p of players) {
      const stats = this.matchService.getStatsForPlayer(p.id);
      if (stats.matchesPlayed > 0 && stats.winPercentage > best.winPct) {
        best = { name: p.name, winPct: stats.winPercentage };
      }
    }
    return best.winPct >= 0 ? best : null;
  }

  playerName(id: string): string {
    return this.playerService.getById(id)?.name ?? 'Unknown';
  }

  teamLabel(ids: [string, string]): string {
    return ids.map(id => this.playerName(id)).join(' & ');
  }

  setScoreSummary(sets: Array<{team1: number; team2: number}>): string {
    return sets.map(s => `${s.team1}-${s.team2}`).join(', ');
  }
}
