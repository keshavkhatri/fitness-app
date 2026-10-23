import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { PROFILE } from '../workout/testing/workout-fixtures';
import { DailyGoalsComponent } from './daily-goals.component';

async function render(storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }] });
  const fixture = TestBed.createComponent(DailyGoalsComponent);
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const text = (id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
  // The water goal needs the profile and weigh-ins: it shows a dash until it is known.
  await vi.waitFor(async () => {
    await settle();
    expect(text('goal-water-value')).not.toBe('–');
  });
  const click = async (id: string) => {
    (el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
    await settle();
  };
  return { el, storage, text, click };
}

describe('DailyGoalsComponent (Settings › Daily goals)', () => {
  it('starts at the suggestions: 10,000 steps, and water from body weight', async () => {
    const { text } = await render();
    expect(text('goal-steps-value')).toBe('10,000');
    expect(text('goal-steps-hint')).toBe('Suggested');
    expect(text('goal-water-value')).toBe('3.0 L');
    expect(text('goal-water-hint')).toBe('Suggested from your weight');
  });

  it('moves the step goal by 500 and saves it; the ends of the range disable the buttons', async () => {
    const { text, click, el, storage } = await render();
    await click('goal-steps-more');
    await click('goal-steps-more');
    expect(text('goal-steps-value')).toBe('11,000');
    expect(text('goal-steps-hint')).toBe('Your goal');
    expect(JSON.parse(storage.values.get('fitness.daily-goals')!).goals.steps).toBe(11_000);
    for (let i = 0; i < 25; i++) {
      await click('goal-steps-less');
    }
    expect(text('goal-steps-value')).toBe('1,000');
    expect((el.querySelector('[data-testid="goal-steps-less"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves the water goal by a glass (250 ml) and "Use suggested goals" goes back', async () => {
    const { text, click, el } = await render();
    expect(el.querySelector('[data-testid="goals-reset"]')).toBeNull();
    await click('goal-water-more');
    expect(text('goal-water-value')).toBe('3.25 L');
    expect(text('goal-water-hint')).toBe('Your goal');
    await click('goal-water-less');
    await click('goal-water-less');
    expect(text('goal-water-value')).toBe('2.75 L');
    await click('goals-reset');
    expect(text('goal-steps-value')).toBe('10,000');
    expect(text('goal-water-value')).toBe('3.0 L');
    expect(el.querySelector('[data-testid="goals-reset"]')).toBeNull();
  });

  it('shows and moves the water goal in fluid ounces for imperial units (glasses of 8 fl oz)', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: { ...PROFILE, unitSystem: 'imperial' } }));
    const { text, click } = await render(storage);
    expect(text('goal-water-value')).toMatch(/^\d+ fl oz$/);
    const before = Number(text('goal-water-value')!.split(' ')[0]);
    await click('goal-water-more');
    expect(Number(text('goal-water-value')!.split(' ')[0])).toBe(before + 8);
  });

  it('says so when a goal could not be saved', async () => {
    const { el, click, storage } = await render();
    storage.failWrites = true;
    await click('goal-steps-more');
    expect(el.querySelector('[data-testid="goals-error"]')).not.toBeNull();
    expect((el.querySelector('[data-testid="goal-steps-value"]') as HTMLElement).textContent?.trim()).toBe('10,000');
  });
});
