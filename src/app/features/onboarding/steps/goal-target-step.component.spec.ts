import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { GoalTargetStepComponent } from './goal-target-step.component';

function setup(goal: 'lose-fat' | 'build-muscle', currentKg: number) {
  TestBed.configureTestingModule({ providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
  const flow = TestBed.inject(OnboardingFlow);
  flow.update({ primaryGoal: goal, unitSystem: 'metric', basics: { ...flow.draft().basics, weight: { kilograms: currentKg } } });
  const fixture = TestBed.createComponent(GoalTargetStepComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (value: string) => {
    const input = el.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    const ok = fixture.componentInstance.submit();
    fixture.detectChanges();
    return ok;
  };
  return { flow, el, type, submit, fixture };
}

describe('GoalTargetStepComponent', () => {
  it('a gain target under Build muscle is accepted (e.g. 50 kg now, 80 kg target)', () => {
    const { flow, type, submit } = setup('build-muscle', 50);
    type('80');
    expect(submit()).toBe(true);
    expect(flow.draft().goalTarget.targetWeight).toEqual({ kilograms: 80 });
  });

  it('a gain target under Lose fat explains why and offers Build muscle in one tap, keeping the target', () => {
    const { flow, el, type, submit, fixture } = setup('lose-fat', 50);
    type('80');
    expect(submit()).toBe(false);
    const offer = el.querySelector<HTMLElement>('[data-testid="target-switch-goal"]')!;
    expect(offer.textContent).toContain('Lose fat (a calorie deficit)');
    const button = offer.querySelector('button')!;
    expect(button.textContent).toContain('Switch to Build muscle and keep 80 kg');
    button.click();
    fixture.detectChanges();
    expect(flow.draft().primaryGoal).toBe('build-muscle');
    expect(flow.draft().goalTarget.targetWeight).toEqual({ kilograms: 80 });
    expect(el.querySelector('[data-testid="target-switch-goal"]')).toBeNull();
    expect(submit()).toBe(true);
  });

  it('a loss target under Build muscle offers Lose fat', () => {
    const { el, type, submit } = setup('build-muscle', 90);
    type('75');
    expect(submit()).toBe(false);
    expect(el.querySelector('[data-testid="target-switch-goal"] button')!.textContent).toContain('Switch to Lose fat and keep 75 kg');
  });
});
