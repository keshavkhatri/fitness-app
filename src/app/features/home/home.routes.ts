import { Routes } from '@angular/router';

import { DemoHomeSummarySource } from './data/demo-home-summary.source';
import { HomeSummarySource } from './data/home-summary.source';

export default [
  {
    path: '',
    title: 'Home',
    // Swap this provider to move Home from demo data to real data.
    providers: [{ provide: HomeSummarySource, useClass: DemoHomeSummarySource }],
    loadComponent: () => import('./home.page').then((m) => m.HomePage),
  },
] satisfies Routes;
