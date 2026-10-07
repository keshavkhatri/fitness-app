import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { DEMO_HOME_SUMMARY } from './data/home-summary.demo';
import { HomeSummarySource } from './data/home-summary.source';
import { HomeSummary } from './home.models';
import { HomePage } from './home.page';

class StubSource implements HomeSummarySource {
  constructor(
    readonly isDemo: boolean,
    private readonly result: () => Promise<HomeSummary>,
  ) {}

  load() {
    return this.result();
  }
}

async function render(source: HomeSummarySource) {
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: HomeSummarySource, useValue: source }],
  });
  const fixture = TestBed.createComponent(HomePage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const resolved = (summary: HomeSummary) => () => Promise.resolve(summary);

describe('HomePage', () => {
  it('renders every dashboard section from the injected source', async () => {
    const el = await render(new StubSource(false, resolved(DEMO_HOME_SUMMARY)));

    expect(el.textContent).toContain(`, ${DEMO_HOME_SUMMARY.user.firstName}`);
    for (const heading of ['Your goal', "Today's workout", 'Nutrition', 'Progress']) {
      expect(el.textContent).toContain(heading);
    }
  });

  it('labels content as demo only when the source is a demo', async () => {
    const real = await render(new StubSource(false, resolved(DEMO_HOME_SUMMARY)));
    expect(real.textContent).not.toContain('Demo data');

    TestBed.resetTestingModule();
    const demo = await render(new StubSource(true, resolved(DEMO_HOME_SUMMARY)));
    expect(demo.textContent).toContain('Demo data');
  });

  it('shows an error state with retry when loading fails', async () => {
    const el = await render(new StubSource(false, () => Promise.reject(new Error('offline'))));

    expect(el.textContent).toContain("Couldn't load your summary");
    expect(el.querySelector('button[fit-button]')?.textContent).toContain('Try again');
  });

  it('shows a rest day when nothing is scheduled', async () => {
    const el = await render(new StubSource(false, resolved({ ...DEMO_HOME_SUMMARY, todayWorkout: null })));

    expect(el.textContent).toContain('Rest day');
  });
});
