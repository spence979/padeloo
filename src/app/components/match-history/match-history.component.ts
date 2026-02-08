import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatchService } from '../../services/match.service';
import { PlayerService } from '../../services/player.service';
import { Match } from '../../models/match.model';

@Component({
  selector: 'app-match-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './match-history.component.html',
  styleUrl: './match-history.component.scss',
})
export class MatchHistoryComponent {
  constructor(
    public matchService: MatchService,
    public playerService: PlayerService
  ) {}

  get sortedMatches(): Match[] {
    return [...this.matchService.matches()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  playerName(id: string): string {
    return this.playerService.getById(id)?.name ?? 'Unknown';
  }

  teamLabel(ids: [string, string]): string {
    return ids.map(id => this.playerName(id)).join(' & ');
  }

  setScore(match: Match): string {
    return match.sets.map(s => `${s.team1}-${s.team2}`).join(', ');
  }

  remove(id: string): void {
    if (confirm('Delete this match?')) {
      this.matchService.remove(id);
    }
  }
}
