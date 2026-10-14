import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { INBODY_EXTRACTION_ENDPOINT, INBODY_EXTRACTION_FETCH } from '../../core/inbody/inbody-extraction.client';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { OnboardingPage } from './onboarding.page';
import { OnboardingFlow } from './state/onboarding-flow.service';
import { OnboardingProgress } from './state/onboarding-progress.store';
import { ReportImport } from './state/report-import.service';
import { completeDraft } from './testing/draft-fixtures';
import { REPORT_TODAY, rawExtraction, rejectedExtraction, uncertain, unreadable } from './testing/report-fixtures';

const PROFILE_KEY = 'fitness.profile';
const PROGRESS_KEY = 'fitness.onboarding-progress';
const WEIGHT_HISTORY_KEY = 'fitness.body-weight-entries';
const BODY_COMPOSITION_KEY = 'fitness.body-composition-assessments';
const WORKOUT_PLAN_KEY = 'fitness.workout-plan';
const EXISTING_PLAN = '{"version":1,"plan":"existing"}';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const reportImage = () => new File([new Uint8Array(32)], 'my-inbody.png', { type: 'image/png' });

/** First-run onboarding with a mocked extraction endpoint; nothing reaches the network. */
async function render(options: { answers?: (() => Promise<Response>)[]; saved?: OnboardingProgress; endpoint?: string | null } = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set(WORKOUT_PLAN_KEY, EXISTING_PLAN);
  if (options.saved) {
    storage.values.set(PROGRESS_KEY, JSON.stringify({ version: 3, ...options.saved }));
  }
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const answer of options.answers ?? []) {
    fetch.mockImplementationOnce(answer);
  }
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      OnboardingFlow,
      ReportImport,
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => new Date(`${REPORT_TODAY}T12:00:00`) },
      { provide: INBODY_EXTRACTION_ENDPOINT, useValue: options.endpoint === undefined ? 'https://api.example.test/x' : options.endpoint },
      { provide: INBODY_EXTRACTION_FETCH, useValue: fetch },
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  // Presses here are seconds apart (the page ignores the tail of a double tap).
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
  const fixture = TestBed.createComponent(OnboardingPage);
  fixture.detectChanges();
  const flow = fixture.debugElement.injector.get(OnboardingFlow);
  await vi.waitFor(() => expect(flow.ready()).toBe(true));

  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();

  const primary = () => el.querySelector<HTMLButtonElement>('ion-footer button')!;
  const heading = () => el.querySelector('[data-step-heading]')?.textContent?.trim();
  const clickPrimary = async () => {
    primary().click();
    await settle();
  };
  const choose = async (text: string) => {
    [...el.querySelectorAll('fit-choice-group label')].find((l) => l.textContent?.includes(text))!.querySelector('input')!.click();
    await settle();
  };
  const field = (label: string) =>
    [...el.querySelectorAll('fit-text-field')]
      .find((f) => f.querySelector('label')?.textContent?.trim() === label)!
      .querySelector('input')!;
  const type = async (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const pickImage = async (file: File) => {
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const clickButton = async (text: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent?.includes(text))!.click();
    await settle();
  };
  /** Welcome → "Set up from an InBody report instead" → the upload step. */
  const startWithReport = async () => {
    await clickButton('Set up from an InBody report instead');
  };
  /** The report was read: on to the details screen, answered, then on to height. */
  const confirmDetails = async () => {
    await clickPrimary(); // "Check my details"
    await type('Your name', 'Alex');
    await type('Date of birth', '1988-03-09');
    await clickPrimary();
  };
  const ruler = () => el.querySelector('fit-ruler')!;

  return { fixture, el, flow, storage, fetch, settle, primary, heading, clickPrimary, choose, field, type, pickImage, clickButton, startWithReport, confirmDetails, ruler };
}

describe('OnboardingPage (InBody report setup)', () => {
  it('offers manual set-up (Get started) and, as a second choice, report upload on the welcome screen', async () => {
    const { el, primary } = await render();
    expect(primary().textContent?.trim()).toBe('Get started');
    expect([...el.querySelectorAll('main button')].some((b) => b.textContent?.includes('Set up from an InBody report instead'))).toBe(true);
  });

  it('keeps the manual path free of the upload step and report notes', async () => {
    const { clickPrimary, heading, flow, el, fetch } = await render();
    await clickPrimary();

    expect(heading()).toBe("Let's get to know you");
    expect(flow.draft().setupMethod).toBe('manual');
    expect(flow.position()).toEqual({ current: 1, total: 11 });
    expect(el.querySelector('.report-note')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hides the upload option when this build cannot read reports', async () => {
    const { el } = await render({ endpoint: null });
    expect([...el.querySelectorAll('main button')].some((b) => b.textContent?.includes('InBody'))).toBe(false);
  });

  it('explains that the image goes to an external AI service before anything is sent', async () => {
    const { startWithReport, heading, el, clickPrimary, fetch } = await render();
    await startWithReport();

    expect(heading()).toBe('Upload your InBody report');
    expect(el.querySelector('fit-notice')?.textContent).toContain('OpenAI, an external AI service');

    await clickPrimary();
    expect(el.textContent).toContain('Choose an image of your report first.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the report once, then prefills each screen for review and saves only after confirmation', async () => {
    let answer!: (response: Response) => void;
    const { startWithReport, pickImage, primary, clickPrimary, clickButton, heading, field, type, el, flow, storage, fetch, settle, ruler } = await render({
      answers: [() => new Promise<Response>((resolve) => (answer = resolve))],
    });
    await startWithReport();
    await pickImage(reportImage());
    expect(el.textContent).toContain('my-inbody.png');

    await clickPrimary();
    expect(primary().disabled).toBe(true);
    expect(primary().textContent).toContain('Reading your report…');
    // A second press (or Enter) while reading must not send the image again.
    primary().click();
    await settle();
    expect(fetch).toHaveBeenCalledOnce();

    answer(json(200, rawExtraction()));
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('read'));
    await settle();
    expect(primary().textContent).toContain('Check my details');

    // About you: sex from the report; the date of birth the report can't give.
    await clickPrimary();
    expect(heading()).toBe('Check your details');
    expect(el.querySelector('fit-choice-group .selected')?.textContent).toContain('Female');
    expect(field('Date of birth').value).toBe('');
    expect(el.textContent).toContain('Your report lists age 38');
    await type('Your name', 'Alex');
    await type('Date of birth', '1988-03-09');
    await clickPrimary();

    // Height: the ruler starts at the report's reading; nothing is saved until Continue.
    expect(heading()).toBe("What's your height?");
    expect(ruler().getAttribute('aria-valuenow')).toBe('172');
    expect(el.textContent).toContain('From your report: 172 cm');
    expect(flow.draft().basics.height).toBeNull();
    // The user corrects it.
    await clickButton('Enter manually');
    await type('Height', '173');
    expect(ruler().getAttribute('aria-valuenow')).toBe('173');
    await clickPrimary();

    // Weight from the report.
    expect(heading()).toBe("What's your weight?");
    expect(ruler().getAttribute('aria-valuenow')).toBe('68.4');
    await clickPrimary();

    flow.update({ activityLevel: 'sedentary', primaryGoal: 'lose-fat', trainingExperience: 'beginner', trainingDaysPerWeek: 3, trainingLocation: 'gym', equipment: ['full-gym'] });
    while (flow.stepId() !== 'summary') {
      await clickPrimary();
    }
    expect(storage.values.has(PROFILE_KEY)).toBe(false);
    expect(storage.values.get(PROGRESS_KEY)).not.toContain('inbody-extraction');

    await clickPrimary(); // "Create my profile"
    await vi.waitFor(() => expect(flow.stepId()).toBe('finish'));

    const saved = JSON.parse(storage.values.get(PROFILE_KEY)!).profile;
    expect(saved).toMatchObject({ dateOfBirth: '1988-03-09', sex: 'female', height: { centimeters: 173 }, weight: { kilograms: 68.4 } });
    // Report measurements stay on the report: no weight entry or assessment is added.
    expect(storage.values.has(WEIGHT_HISTORY_KEY)).toBe(false);
    expect(storage.values.has(BODY_COMPOSITION_KEY)).toBe(false);
    // The finish screen makes the workout plan from the saved profile (replacing the stale one).
    await vi.waitFor(() => expect(JSON.parse(storage.values.get(WORKOUT_PLAN_KEY)!).plan.daysPerWeek).toBe(3));
  });

  it('flags uncertain values and leaves unreadable ones for the user', async () => {
    const { startWithReport, pickImage, clickPrimary, el, settle, confirmDetails, ruler, heading } = await render({
      answers: [async () => json(200, rawExtraction({ profile: { height: unreadable('Height') }, measurements: { weight: uncertain('68.4', 'kg', 'Weight') } }))],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('read'));
    await settle();
    await confirmDetails();

    expect(heading()).toBe("What's your height?");
    expect(ruler().getAttribute('aria-valuenow')).toBe('170'); // a neutral start, not a report value
    expect(el.querySelector('#height-report-note')?.textContent).toContain("Couldn't be read from your report");
    await clickPrimary();

    expect(ruler().getAttribute('aria-valuenow')).toBe('68.4');
    const weightNote = el.querySelector('#weight-report-note');
    expect(weightNote?.getAttribute('data-tone')).toBe('check');
    expect(ruler().getAttribute('aria-describedby')).toContain('weight-report-note');
  });

  it('explains an unsupported report and stays on the upload step', async () => {
    const { startWithReport, pickImage, clickPrimary, el, heading, primary, settle } = await render({
      answers: [async () => json(200, rejectedExtraction('unsupported-report'))],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('failed'));
    await settle();

    expect(heading()).toBe('Upload your InBody report');
    expect(el.textContent).toContain("This doesn't look like an InBody report");
    expect(primary().textContent).toContain('Read my report');
  });

  it('explains a report with too little readable information', async () => {
    const { startWithReport, pickImage, clickPrimary, el, settle } = await render({
      answers: [async () => json(200, rejectedExtraction('insufficient-readable-information', ['low-image-quality']))],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('failed'));
    await settle();

    expect(el.textContent).toContain("We couldn't read this report");
    expect(el.textContent).toContain('The image quality was low');
  });

  it('rejects an invalid response without prefilling anything', async () => {
    const { startWithReport, pickImage, clickPrimary, el, flow, settle } = await render({
      answers: [async () => json(200, { ...(rawExtraction() as object), outcome: 'extracted', extra: true })],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('failed'));
    await settle();

    expect(el.textContent).toContain("We couldn't use the result");
    expect(flow.stepId()).toBe('report');
    expect(TestBed.inject(ReportImport).reading()).toBeNull();
  });

  it('offers a retry after a network failure', async () => {
    const { startWithReport, pickImage, clickPrimary, el, primary, fetch, settle } = await render({
      answers: [() => Promise.reject(new TypeError('Failed to fetch')), async () => json(200, rawExtraction())],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('failed'));
    await settle();
    expect(el.textContent).toContain("Couldn't reach the report service");
    expect(primary().textContent).toContain('Try again');

    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('read'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows the provider failure message for a server error', async () => {
    const { startWithReport, pickImage, clickPrimary, el, settle } = await render({
      answers: [async () => json(504, { error: { code: 'provider-timeout', message: 'x' } })],
    });
    await startWithReport();
    await pickImage(reportImage());
    await clickPrimary();
    await vi.waitFor(() => expect(TestBed.inject(ReportImport).current().status).toBe('failed'));
    await settle();
    expect(el.textContent).toContain('Something went wrong reading your report');
  });

  it('switches to manual entry from the upload step, keeping answers already given', async () => {
    const { clickButton, heading, field, flow, el } = await render({
      saved: { stepId: 'report', draft: completeDraft({ setupMethod: 'report' }), editingFromSummary: false },
    });
    expect(heading()).toBe('Upload your InBody report');

    await clickButton('Enter my details manually instead');

    expect(heading()).toBe("Let's get to know you");
    expect(flow.draft().setupMethod).toBe('manual');
    expect(field('Your name').value).toBe('Alex');
    expect(field('Date of birth').value).toBe('1991-06-15');
    expect(el.querySelector('.report-note')).toBeNull();
  });
});

