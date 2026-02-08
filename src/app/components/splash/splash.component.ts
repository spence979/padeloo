import { Component, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-splash',
  standalone: true,
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss',
})
export class SplashComponent {
  loading = signal(false);
  error = signal('');

  constructor(private auth: AuthService) {}

  async signIn(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithGoogle();
    } catch {
      this.error.set('Sign-in failed. Please try again.');
      this.loading.set(false);
    }
  }
}
