import { Injectable, signal, effect } from '@angular/core';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Player } from '../models/player.model';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { db } from '../firebase';

const STORAGE_KEY = 'padel_players';

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

    // React to auth state changes — start/stop Firestore listener per user
    effect(() => {
      this.unsubFirestore?.();
      this.unsubFirestore = null;

      const user = this.auth.user();
      if (!user) return;

      this.unsubFirestore = onSnapshot(
        collection(db, `users/${user.uid}/players`),
        snapshot => {
          const players = snapshot.docs
            .map(d => d.data() as Player)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          this._players.set(players);
          this.storage.set(STORAGE_KEY, players);
        },
        err => console.warn('Firestore players unavailable:', err.message)
      );
    });
  }

  add(name: string, email?: string): Player {
    const uid = this.auth.user()?.uid;
    const player: Player = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const updated = [...this._players(), player];
    this._players.set(updated);
    this.storage.set(STORAGE_KEY, updated);

    if (uid) {
      setDoc(doc(db, `users/${uid}/players`, player.id), stripUndefined(player));
    }
    return player;
  }

  remove(id: string): void {
    const uid = this.auth.user()?.uid;
    const updated = this._players().filter(p => p.id !== id);
    this._players.set(updated);
    this.storage.set(STORAGE_KEY, updated);
    if (uid) deleteDoc(doc(db, `users/${uid}/players`, id));
  }

  getById(id: string): Player | undefined {
    return this._players().find(p => p.id === id);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
