import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { environment } from '../environments/environment';

const app = initializeApp(environment.firebase);

// Offline persistence via IndexedDB — Firestore handles sync automatically
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
