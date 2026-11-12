import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home-page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'Wichtelgespräch 2026' },
  {
    path: 'session',
    loadComponent: () => import('./features/voice/ptt-session-page').then((m) => m.PttSessionPage),
    title: 'Gespräch · Weihnachtswichtel',
  },
  // Add your MVP's routes here; put their code under src/app/features/.
  { path: '**', redirectTo: '' },
];
