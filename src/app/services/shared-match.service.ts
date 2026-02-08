import { Injectable, signal } from '@angular/core';
import { doc, setDoc, onSnapshot, Unsubscribe, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface SharedMatchData {
  matchId: string;
  hostId: string;
  date: string;
  location: string;
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
  createdAt: number;
}

export type PlayerPosition = 'team1Player1' | 'team1Player2' | 'team2Player1' | 'team2Player2';

@Injectable({
  providedIn: 'root'
})
export class SharedMatchService {
  private currentMatchId = signal<string | null>(null);
  private unsubscribe: Unsubscribe | null = null;

  // Observable match data
  readonly sharedMatchData = signal<SharedMatchData | null>(null);

  constructor() {}

  // Generate a unique match ID
  generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Host creates a shareable match
  async createSharedMatch(matchData: Omit<SharedMatchData, 'matchId' | 'hostId' | 'createdAt'>): Promise<string> {
    const matchId = this.generateMatchId();
    const hostId = this.getUserId(); // Get or create a user ID

    const sharedMatch: SharedMatchData = {
      ...matchData,
      matchId,
      hostId,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'sharedMatches', matchId), sharedMatch);
      this.currentMatchId.set(matchId);
      this.listenToMatch(matchId);
      return matchId;
    } catch (error) {
      console.error('Error creating shared match:', error);
      throw error;
    }
  }

  // Listen to match updates in real-time
  listenToMatch(matchId: string): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.currentMatchId.set(matchId);
    const matchRef = doc(db, 'sharedMatches', matchId);

    this.unsubscribe = onSnapshot(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SharedMatchData;
        this.sharedMatchData.set(data);
      } else {
        this.sharedMatchData.set(null);
      }
    }, (error) => {
      console.error('Error listening to match:', error);
    });
  }

  // Player joins and selects their position
  async updatePlayerPosition(matchId: string, position: PlayerPosition, playerId: string): Promise<void> {
    try {
      const matchRef = doc(db, 'sharedMatches', matchId);
      await setDoc(matchRef, {
        [position]: playerId
      }, { merge: true });
    } catch (error) {
      console.error('Error updating player position:', error);
      throw error;
    }
  }

  // Update match data (for host)
  async updateMatchData(matchId: string, updates: Partial<SharedMatchData>): Promise<void> {
    try {
      const matchRef = doc(db, 'sharedMatches', matchId);
      await setDoc(matchRef, updates, { merge: true });
    } catch (error) {
      console.error('Error updating match data:', error);
      throw error;
    }
  }

  // Stop listening to match updates
  stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.currentMatchId.set(null);
    this.sharedMatchData.set(null);
  }

  // Clean up shared match from Firestore
  async deleteSharedMatch(matchId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'sharedMatches', matchId));
      this.stopListening();
    } catch (error) {
      console.error('Error deleting shared match:', error);
    }
  }

  // Get or create a persistent user ID
  private getUserId(): string {
    let userId = localStorage.getItem('padelUserId');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('padelUserId', userId);
    }
    return userId;
  }

  getCurrentMatchId(): string | null {
    return this.currentMatchId();
  }

  getQRCodeData(matchId: string): string {
    // Generate a URL or data string for the QR code
    const baseUrl = window.location.origin;
    return `${baseUrl}/join-match?id=${matchId}`;
  }
}
