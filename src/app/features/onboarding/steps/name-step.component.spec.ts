import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { NameStepComponent } from './name-step.component';

async function render(name: string | null = null) {
  TestBed.configureTestingModule({ providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
  const flow = TestBed.inject(OnboardingFlow);
  await flow.restore();
  flow.update({ name });
  const fixture = TestBed.createComponent(NameStepComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input')!;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, flow, el, input, type, step: fixture.componentInstance };
}

describe('NameStepComponent', () => {
  it('asks for a name, labelled for assistive tech and autofill', async () => {
    const { el, input } = await render();
    expect(el.querySelector('[data-step-heading]')?.textContent?.trim()).toBe('What should we call you?');
    expect(el.querySelector('label')?.textContent?.trim()).toBe('Your name');
    expect(input.getAttribute('autocomplete')).toBe('given-name');
  });

  it('commits a trimmed name', async () => {
    const { flow, type, step } = await render();
    type('  Alex   Morgan ');
    expect(step.submit()).toBe(true);
    expect(flow.draft().name).toBe('Alex Morgan');
  });

  it('a blank name is not accepted and says why', async () => {
    const { fixture, el, flow, type, step } = await render();
    type('   ');
    expect(step.submit()).toBe(false);
    fixture.detectChanges();
    expect(el.textContent).toContain('Add your name to continue.');
    expect(flow.draft().name).toBeNull();
  });

  it('prefills a name already given (resumed or reviewing)', async () => {
    const { input } = await render('Sam');
    expect(input.value).toBe('Sam');
  });
});
