import { Injectable, signal, effect } from '@angular/core';
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Player } from '../models/player.model';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { db } from '../firebase';

const STORAGE_KEY = 'padel_players_v2';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private _players = signal<Player[]>([]);
  readonly players = this._players.asReadonly();

  private unsubFirestore: (() => void) | null = null;

  constructor(
    private storage: StorageService,
    private auth: AuthService
  ) {
    // Load from localStorage immediately (fast / offline start)
    this._players.set(this.storage.get<Player>(STORAGE_KEY));

    // React to auth state — start global listener and ensure auth user has a profile
    effect(() => {
      this.unsubFirestore?.();
      this.unsubFirestore = null;

      const user = this.auth.user();
      if (!user) return;

      // Listen to the global players collection
      this.unsubFirestore = onSnapshot(
        collection(db, 'players'),
        snapshot => {
          const players = snapshot.docs
            .map(d => d.data() as Player)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          this._players.set(players);
          this.storage.set(STORAGE_KEY, players);
        },
        err => console.warn('Firestore players unavailable:', err.message)
      );

      // Auto-create a player profile for this auth user if one doesn't exist
      this.ensureAuthProfile(user);
    });
  }

  // Creates a player profile for the auth user on first sign-in.
  // Uses user.uid as the player ID so identity is always resolvable from the auth token.
  async ensureAuthProfile(user: User): Promise<void> {
    const ref = doc(db, 'players', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const player: Player = {
        id: user.uid,
        name: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
        email: user.email ?? undefined,
        authUid: user.uid,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, stripUndefined(player));
    }
  }

  add(name: string, email?: string): Player {
    const player: Player = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const updated = [...this._players(), player];
    this._players.set(updated);
    this.storage.set(STORAGE_KEY, updated);
    setDoc(doc(db, 'players', player.id), stripUndefined(player));
    return player;
  }

  remove(id: string): void {
    const updated = this._players().filter(p => p.id !== id);
    this._players.set(updated);
    this.storage.set(STORAGE_KEY, updated);
    deleteDoc(doc(db, 'players', id));
  }

  getById(id: string): Player | undefined {
    return this._players().find(p => p.id === id);
  }

  getByAuthUid(uid: string): Player | undefined {
    return this._players().find(p => p.authUid === uid);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
