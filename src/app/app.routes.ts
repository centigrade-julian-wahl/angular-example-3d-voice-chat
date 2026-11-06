import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home-page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'LeanScope MVP' },
  {
    path: 'session',
    loadComponent: () => import('./pages/session/session-page').then((m) => m.SessionPage),
    title: 'Session · LeanScope MVP',
  },
  // Add your MVP's routes here; put their code under src/app/features/.
  { path: '**', redirectTo: '' },
];
