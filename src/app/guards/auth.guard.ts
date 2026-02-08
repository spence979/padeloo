import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);

  // Resolve once we know the auth state (handles page reload)
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(getAuth(), user => {
      unsub();
      resolve(user ? true : router.createUrlTree(['/login']));
    });
  });
};
