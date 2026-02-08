import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./components/splash/splash.component').then(m => m.SplashComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'players',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/players/players.component').then(m => m.PlayersComponent),
  },
  {
    path: 'new-match',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/new-match/new-match.component').then(m => m.NewMatchComponent),
  },
  {
    path: 'match-scoring',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/match-scoring/match-scoring.component').then(
        m => m.MatchScoringComponent
      ),
  },
  {
    path: 'join-match',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/join-match/join-match.component').then(
        m => m.JoinMatchComponent
      ),
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/match-history/match-history.component').then(
        m => m.MatchHistoryComponent
      ),
  },
  { path: '**', redirectTo: '' },
];
