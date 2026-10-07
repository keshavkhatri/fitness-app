import { HomeSummary } from '../home.models';

/**
 * Where the Home dashboard gets its data. The page depends only on this
 * abstraction; the concrete source is chosen in `home.routes.ts`.
 *
 * Today: `DemoHomeSummarySource`. Later: an implementation that composes
 * API/local workout, nutrition and progress data into a `HomeSummary`.
 */
export abstract class HomeSummarySource {
  /** True while backed by demo content; the UI labels the screen accordingly. */
  abstract readonly isDemo: boolean;
  abstract load(): Promise<HomeSummary>;
}
