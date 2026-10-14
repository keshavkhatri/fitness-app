import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { OnboardingStepForm } from './onboarding-step-form';
import { HeightStepComponent } from './height-step.component';
import { WeightStepComponent } from './weight-step.component';

function setup<T extends OnboardingStepForm>(component: Type<T>, prepare: (flow: OnboardingFlow) => void = () => undefined) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList); // no animation
  TestBed.configureTestingModule({ providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
  const flow = TestBed.inject(OnboardingFlow);
  prepare(flow);
  const fixture: ComponentFixture<T> = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const ruler = () => el.querySelector<HTMLElement>('fit-ruler')!;
  const key = (k: string) => {
    ruler().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const unit = (label: string) => {
    [...el.querySelectorAll('fit-segmented-control label')].find((l) => l.textContent?.trim() === label)!.querySelector('input')!.click();
    fixture.detectChanges();
  };
  const openManual = () => {
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Enter manually'))!.click();
    fixture.detectChanges();
  };
  const inputs = () => [...el.querySelectorAll<HTMLInputElement>('.manual input')];
  const type = (index: number, value: string) => {
    const input = inputs()[index];
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    const ok = fixture.componentInstance.submit();
    fixture.detectChanges();
    return ok;
  };
  return { fixture, flow, el, ruler, key, unit, openManual, inputs, type, submit, now: () => ruler().getAttribute('aria-valuenow') };
}

describe('HeightStepComponent', () => {
  it('starts at a typical height without saving it, and saves the chosen one on Continue', () => {
    const { flow, now, key, submit } = setup(HeightStepComponent);
    expect(now()).toBe('170');
    expect(flow.draft().basics.height).toBeNull();
    key('ArrowUp');
    key('ArrowUp');
    expect(flow.draft().basics.height).toBeNull(); // not until Continue
    expect(submit()).toBe(true);
    expect(flow.draft().basics.height).toEqual({ centimeters: 172 });
  });

  it('keeps a changed height when the user goes back without continuing', () => {
    const { fixture, flow, key } = setup(HeightStepComponent);
    key('ArrowDown');
    fixture.destroy();
    expect(flow.draft().basics.height).toEqual({ centimeters: 169 });
  });

  it('going back unchanged saves nothing (no made-up default)', () => {
    const { fixture, flow } = setup(HeightStepComponent);
    fixture.destroy();
    expect(flow.draft().basics.height).toBeNull();
  });

  it('restores the saved height, shown exactly even between ticks', () => {
    const { now } = setup(HeightStepComponent, (flow) => flow.update({ basics: { ...flow.draft().basics, height: { centimeters: 172.5 } } }));
    expect(now()).toBe('172.5');
  });

  it('typed and ruler values stay in step', () => {
    const { openManual, type, inputs, key, now, submit, flow } = setup(HeightStepComponent);
    openManual();
    expect(inputs().map((i) => i.value)).toEqual(['170']);
    type(0, '181.5');
    expect(now()).toBe('181.5');
    key('ArrowUp'); // from the nearest tick (182)
    expect(inputs()[0].value).toBe('183');
    expect(submit()).toBe(true);
    expect(flow.draft().basics.height).toEqual({ centimeters: 183 });
  });

  it('will not continue with an invalid typed height, and says why', () => {
    const { openManual, type, submit, el, flow } = setup(HeightStepComponent);
    openManual();
    type(0, '30');
    expect(submit()).toBe(false);
    expect(el.textContent).toContain('Enter a height between 50 and 275 cm.');
    expect(flow.draft().basics.height).toBeNull();
  });

  it('switches to feet and inches and back without changing the height', () => {
    const { unit, now, openManual, inputs, flow, submit } = setup(HeightStepComponent, (f) =>
      f.update({ basics: { ...f.draft().basics, height: { centimeters: 179 } } }),
    );
    openManual();
    unit('ft in');
    expect(flow.draft().unitSystem).toBe('imperial'); // a preference, saved at once
    expect(now()).toBe('70'); // inches: 5′ 10″
    expect(inputs().map((i) => i.value)).toEqual(['5', '10']);
    unit('cm');
    expect(now()).toBe('179');
    expect(submit()).toBe(true);
    expect(flow.draft().basics.height).toEqual({ centimeters: 179 });
  });

  it('in feet and inches, a ruler step saves whole inches converted once', () => {
    const { unit, key, submit, flow } = setup(HeightStepComponent);
    unit('ft in');
    key('ArrowUp'); // 5′ 7″ (67 in) → 5′ 8″
    expect(submit()).toBe(true);
    expect(flow.draft().basics.height).toEqual({ centimeters: 172.7 });
  });
});

describe('WeightStepComponent', () => {
  it('steps in 0.1 and saves canonical kilograms', () => {
    const { key, submit, flow, now } = setup(WeightStepComponent);
    expect(now()).toBe('70');
    key('ArrowRight');
    key('PageUp');
    expect(now()).toBe('71.1');
    expect(submit()).toBe(true);
    expect(flow.draft().basics.weight).toEqual({ kilograms: 71.1 });
  });

  it('switches to pounds and back without drift', () => {
    const { unit, now, submit, flow } = setup(WeightStepComponent, (f) => f.update({ basics: { ...f.draft().basics, weight: { kilograms: 94.5 } } }));
    unit('lb');
    expect(now()).toBe('208.3');
    unit('kg');
    expect(now()).toBe('94.5');
    unit('lb');
    unit('kg');
    expect(submit()).toBe(true);
    expect(flow.draft().basics.weight).toEqual({ kilograms: 94.5 });
  });

  it('typed and ruler values stay in step; an invalid typed value blocks Continue', () => {
    const { openManual, type, now, submit, inputs, el, key } = setup(WeightStepComponent);
    openManual();
    type(0, '82,4');
    expect(now()).toBe('82.4');
    key('ArrowLeft');
    expect(inputs()[0].value).toBe('82.3');
    type(0, '12');
    expect(now()).toBe('82.3'); // the ruler keeps the last valid weight
    expect(submit()).toBe(false);
    expect(el.textContent).toContain('Enter a weight between 20 and 500 kg.');
  });

  it('keeps a changed weight on Back', () => {
    const { fixture, flow, key } = setup(WeightStepComponent);
    key('ArrowLeft');
    fixture.destroy();
    expect(flow.draft().basics.weight).toEqual({ kilograms: 69.9 });
  });
});
