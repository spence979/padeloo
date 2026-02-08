import { Injectable, signal } from '@angular/core';

export interface MatchSetup {
  date: string;
  location: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
}

@Injectable({
  providedIn: 'root'
})
export class MatchSetupService {
  private currentSetup = signal<MatchSetup | null>(null);

  setSetup(setup: MatchSetup): void {
    this.currentSetup.set(setup);
  }

  getSetup(): MatchSetup | null {
    return this.currentSetup();
  }

  clearSetup(): void {
    this.currentSetup.set(null);
  }
}
