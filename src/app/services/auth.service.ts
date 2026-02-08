import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import '../firebase'; // ensure Firebase app is initialized

@Injectable({ providedIn: 'root' })
export class AuthService {
  // undefined = loading, null = not signed in, User = authenticated
  private _user = signal<User | null | undefined>(undefined);
  readonly user = this._user.asReadonly();

  constructor(private router: Router) {
    onAuthStateChanged(getAuth(), user => {
      this._user.set(user);
      if (!user) {
        this.router.navigate(['/login']);
      } else if (this.router.url === '/login') {
        this.router.navigate(['/']);
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(getAuth(), new GoogleAuthProvider());
    // onAuthStateChanged handles navigation
  }

  async signOut(): Promise<void> {
    await signOut(getAuth());
    // onAuthStateChanged handles redirect to /login
  }
}
