import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlayerService } from '../../services/player.service';
import { MatchService } from '../../services/match.service';

@Component({
  selector: 'app-players',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './players.component.html',
  styleUrl: './players.component.scss',
})
export class PlayersComponent {
  showForm = signal(false);
  newName = '';
  newEmail = '';

  constructor(
    public playerService: PlayerService,
    public matchService: MatchService
  ) {}

  submit(): void {
    if (!this.newName.trim()) return;
    this.playerService.add(this.newName, this.newEmail || undefined);
    this.newName = '';
    this.newEmail = '';
    this.showForm.set(false);
  }

  remove(id: string): void {
    if (confirm('Remove this player?')) {
      this.playerService.remove(id);
    }
  }
}
