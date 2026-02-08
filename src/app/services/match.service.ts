import { Injectable, signal, computed, effect } from '@angular/core';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Match, SetScore } from '../models/match.model';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { db } from '../firebase';

const STORAGE_KEY = 'padel_matches';

export interface PlayerStats {
  playerId: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winPercentage: number;
}

@Injectable({ providedIn: 'root' })
export class MatchService {
  private _matches = signal<Match[]>([]);
  readonly matches = this._matches.asReadonly();

  readonly recentMatches = computed(() =>
    [...this._matches()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
  );

  private unsubFirestore: (() => void) | null = null;

  constructor(
    private storage: StorageService,
    private auth: AuthService
  ) {
    // Load from localStorage immediately (fast / offline start)
    this._matches.set(this.storage.get<Match>(STORAGE_KEY));

    // React to auth state changes — start/stop Firestore listener per user
    effect(() => {
      this.unsubFirestore?.();
      this.unsubFirestore = null;

      const user = this.auth.user();
      if (!user) return;

      this.unsubFirestore = onSnapshot(
        collection(db, `users/${user.uid}/matches`),
        snapshot => {
          const matches = snapshot.docs
            .map(d => d.data() as Match)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          this._matches.set(matches);
          this.storage.set(STORAGE_KEY, matches);
        },
        err => console.warn('Firestore matches unavailable:', err.message)
      );
    });
  }

  add(match: Omit<Match, 'id' | 'createdAt' | 'winnerId'>): Match {
    const uid = this.auth.user()?.uid;
    const winnerId = this.computeWinner(match.sets);
    const newMatch: Match = {
      ...match,
      id: crypto.randomUUID(),
      winnerId,
      createdAt: new Date().toISOString(),
    };

    const updated = [...this._matches(), newMatch];
    this._matches.set(updated);
    this.storage.set(STORAGE_KEY, updated);

    if (uid) {
      setDoc(doc(db, `users/${uid}/matches`, newMatch.id), stripUndefined(newMatch));
    }
    return newMatch;
  }

  remove(id: string): void {
    const uid = this.auth.user()?.uid;
    const updated = this._matches().filter(m => m.id !== id);
    this._matches.set(updated);
    this.storage.set(STORAGE_KEY, updated);
    if (uid) deleteDoc(doc(db, `users/${uid}/matches`, id));
  }

  getById(id: string): Match | undefined {
    return this._matches().find(m => m.id === id);
  }

  getStatsForPlayer(playerId: string): PlayerStats {
    const playerMatches = this._matches().filter(
      m => m.team1.includes(playerId) || m.team2.includes(playerId)
    );
    const wins = playerMatches.filter(m => {
      const isTeam1 = m.team1.includes(playerId);
      return isTeam1 ? m.winnerId === 1 : m.winnerId === 2;
    }).length;
    const losses = playerMatches.length - wins;
    return {
      playerId,
      wins,
      losses,
      matchesPlayed: playerMatches.length,
      winPercentage:
        playerMatches.length > 0 ? Math.round((wins / playerMatches.length) * 100) : 0,
    };
  }

  private computeWinner(sets: SetScore[]): 1 | 2 | undefined {
    let team1Sets = 0;
    let team2Sets = 0;
    for (const set of sets) {
      if (set.team1 > set.team2) team1Sets++;
      else if (set.team2 > set.team1) team2Sets++;
    }
    if (team1Sets > team2Sets) return 1;
    if (team2Sets > team1Sets) return 2;
    return undefined;
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
