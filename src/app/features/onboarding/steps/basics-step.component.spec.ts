import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { BasicsStepComponent } from './basics-step.component';

function setup() {
  TestBed.configureTestingModule({
    providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }],
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
    [...el.querySelectorAll('fit-choice-group label, fit-segmented-control label')]
      .find((l) => l.textContent?.includes(text))!
      .querySelector('input')!
      .click();
    fixture.detectChanges();
  };
  const submit = () => {
    const ok = fixture.componentInstance.submit();
    fixture.detectChanges();
    return ok;
  };

  return { el, field, type, choose, submit, flow: TestBed.inject(OnboardingFlow) };
}

describe('BasicsStepComponent', () => {
  it('shows inline, accessible errors only after the first submit', () => {
    const { el, field, submit } = setup();
    expect(el.querySelectorAll('.error').length).toBe(0);

    expect(submit()).toBe(false);

    const day = field('Day');
    expect(day.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(day.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Enter your date of birth.',
    );
    expect(document.activeElement).toBe(day); // focus moves to the first problem
    expect(el.textContent).toContain('Choose an option.');
  });

  it('clears an error as soon as the field is fixed', () => {
    const { field, type, submit } = setup();
    submit();

    type('Day', '15');
    type('Month', '6');
    type('Year', '1990');
    expect(field('Day').getAttribute('aria-invalid')).toBeNull();
  });

  it('commits valid answers to the flow in canonical units', () => {
    const { type, choose, submit, flow } = setup();
    choose('Imperial');
    type('Day', '3');
    type('Month', '4');
    type('Year', '1990');
    choose('Male');
    type('Feet', '6');
    type('Inches', '1');
    type('Weight', '190');

    expect(submit()).toBe(true);
    expect(flow.draft().unitSystem).toBe('imperial');
    expect(flow.draft().basics).toEqual({
      dateOfBirth: '1990-04-03',
      sex: 'male',
      height: { centimeters: 185.4 },
      weight: { kilograms: 86.18 },
    });
  });

  it('rejects an under-18 date of birth', () => {
    const { el, type, choose, submit, flow } = setup();
    const year = String(new Date().getFullYear() - 17);
    type('Day', '1');
    type('Month', '1');
    type('Year', year);
    choose('Male');
    type('Height', '180');
    type('Weight', '80');

    expect(submit()).toBe(false);
    expect(el.textContent).toContain('You need to be 18 or older to use this app.');
    expect(flow.draft().basics).toBeNull();
  });

  it('does not commit invalid input', () => {
    const { type, choose, submit, flow } = setup();
    type('Day', '15');
    type('Month', '6');
    type('Year', '1990');
    choose('Female');
    type('Height', '170');
    type('Weight', '0');

    expect(submit()).toBe(false);
    expect(flow.draft().basics).toBeNull();
  });

  it('shows an ambiguous inches value as a height error and keeps it out of the draft', () => {
    const { el, field, type, choose, submit, flow } = setup();
    choose('Imperial');
    type('Day', '3');
    type('Month', '4');
    type('Year', '1990');
    choose('Male');
    type('Feet', '5');
    type('Inches', '1,234'); // e.g. pasted past the field's length limit
    type('Weight', '190');

    expect(submit()).toBe(false);
    expect(el.querySelector('#height-error')?.textContent?.trim()).toBe("Check number format. Use one decimal separator. Thousands separators aren't supported.");
    expect(field('Inches').getAttribute('aria-invalid')).toBe('true');
    expect(field('Inches').getAttribute('aria-describedby')).toContain('height-error');
    expect(document.activeElement).toBe(field('Feet')); // the height group's first field, as before
    expect(flow.draft().basics).toBeNull();

    type('Inches', '1.5');
    expect(submit()).toBe(true);
    expect(flow.draft().basics?.height).toEqual({ centimeters: 156.2 });
  });
});
