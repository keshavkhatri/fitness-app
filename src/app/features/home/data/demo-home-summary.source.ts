import { Injectable } from '@angular/core';

import { HomeSummary } from '../home.models';
import { DEMO_HOME_SUMMARY } from './home-summary.demo';
import { HomeSummarySource } from './home-summary.source';

/** Demo-only source for visual development. Delete along with `home-summary.demo.ts`. */
@Injectable()
export class DemoHomeSummarySource implements HomeSummarySource {
  readonly isDemo = true;

  load(): Promise<HomeSummary> {
    return Promise.resolve(DEMO_HOME_SUMMARY);
  }
}
