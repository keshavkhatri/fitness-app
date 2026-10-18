import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { BasicsStepComponent } from './basics-step.component';

/** 7 October 2026. */
const NOW = new Date(2026, 9, 7);

function setup() {
  TestBed.configureTestingModule({
    providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }, { provide: CLOCK, useValue: () => NOW }],
  });
  const fixture = TestBed.createComponent(BasicsStepComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const field = (label: string) =>
    [...el.querySelectorAll('fit-text-field')]
      .find((f) => f.querySelector('label')?.textContent?.trim() === label)!
      .querySelector('input')!;
  const type = (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const choose = (text: string) => {
    [...el.querySelectorAll('fit-choice-group label')].find((l) => l.textContent?.includes(text))!.querySelector('input')!.click();
    fixture.detectChanges();
  };
  const submit = () => {
    const ok = fixture.componentInstance.submit();
    fixture.detectChanges();
    return ok;
  };

  return { fixture, el, field, type, choose, submit, flow: TestBed.inject(OnboardingFlow) };
}

describe('BasicsStepComponent (about you)', () => {
  it('asks for sex (as cards) and date of birth (date picker, no later than today), not a name', () => {
    const { el, field } = setup();
    // The name comes from the account after the questionnaire.
    expect(el.querySelectorAll('fit-text-field')).toHaveLength(1);
    expect(el.textContent).not.toContain('Your name');
    expect(el.querySelector('h1')?.textContent).toContain("Let's get to know you");
    expect([...el.querySelectorAll('fit-choice-group .title')].map((t) => t.textContent?.trim())).toEqual(['Male', 'Female', 'Prefer not to say']);
    expect(field('Date of birth').type).toBe('date');
    expect(field('Date of birth').max).toBe('2026-10-07');
  });

  it('shows inline, accessible errors only after the first submit', () => {
    const { el, field, submit } = setup();
    expect(el.textContent).not.toContain('Choose an option.');

    expect(submit()).toBe(false);

    expect(el.textContent).toContain('Choose an option.');
    expect(el.textContent).toContain('Enter your date of birth.');
    expect(field('Date of birth').getAttribute('aria-invalid')).toBe('true');
  });

  it('clears an error as soon as the field is fixed', () => {
    const { el, type, submit } = setup();
    submit();
    type('Date of birth', '1994-01-12');
    expect(el.textContent).not.toContain('Enter your date of birth.');
  });

  it('commits valid answers, keeping height and weight answered elsewhere', () => {
    const { type, choose, submit, flow } = setup();
    flow.update({ basics: { ...flow.draft().basics, height: { centimeters: 180 } } });
    choose('Male');
    type('Date of birth', '1994-01-12');

    expect(submit()).toBe(true);
    expect(flow.draft().name).toBeNull();
    expect(flow.draft().basics).toEqual({ dateOfBirth: '1994-01-12', sex: 'male', height: { centimeters: 180 }, weight: null });
  });

  it('rejects an under-18 date of birth and commits nothing', () => {
    const { el, type, choose, submit, flow } = setup();
    choose('Female');
    type('Date of birth', '2010-03-01');

    expect(submit()).toBe(false);
    expect(el.textContent).toContain('You need to be 18 or older to use this app.');
    expect(flow.draft().basics.dateOfBirth).toBeNull();
  });

  it('keeps valid answers when the user leaves without continuing (Back)', () => {
    const { fixture, type, choose, flow } = setup();
    choose('Female');
    type('Date of birth', '2010-03-01'); // too young: not kept

    fixture.destroy();

    expect(flow.draft().basics).toMatchObject({ sex: 'female', dateOfBirth: null });
  });

  it('starts from saved answers', () => {
    TestBed.configureTestingModule({ providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
    const flow = TestBed.inject(OnboardingFlow);
    flow.update({ basics: { dateOfBirth: '1980-02-29', sex: 'prefer-not-to-say', height: null, weight: null } });
    const fixture = TestBed.createComponent(BasicsStepComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = [...el.querySelectorAll<HTMLInputElement>('fit-text-field input')];
    expect(inputs.map((i) => i.value)).toEqual(['1980-02-29']);
    expect(el.querySelector('fit-choice-group .selected')?.textContent).toContain('Prefer not to say');
  });
});
