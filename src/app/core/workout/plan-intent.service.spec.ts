import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { PlanIntentService } from './plan-intent.service';

describe('PlanIntentService', () => {
  const setup = (stored?: string) => {
    const storage = new MemoryKeyValueStorage();
    if (stored !== undefined) {
      storage.values.set('stokeform.plan-intent', stored);
    }
    TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }] });
    return { storage, intents: TestBed.inject(PlanIntentService) };
  };

  it('is the generated plan until "Build my own" is chosen; remembers it and forgets it when cleared', async () => {
    const { storage, intents } = setup();
    expect(await intents.load()).toBe('generated');
    await intents.set('custom');
    expect(intents.intent()).toBe('custom');
    expect(JSON.parse(storage.values.get('stokeform.plan-intent')!)).toEqual({ version: 1, intent: 'custom' });
    await intents.clear();
    expect(intents.intent()).toBe('generated');
    expect(storage.values.has('stokeform.plan-intent')).toBe(false);
  });

  it('reads a saved choice, and treats anything unreadable as the generated plan', async () => {
    expect(await setup(JSON.stringify({ version: 1, intent: 'custom' })).intents.load()).toBe('custom');
    TestBed.resetTestingModule();
    expect(await setup('not json').intents.load()).toBe('generated');
    TestBed.resetTestingModule();
    expect(await setup(JSON.stringify({ version: 9, intent: 'custom' })).intents.load()).toBe('generated');
  });

  it('keeps the choice for the session when storage fails', async () => {
    const { storage, intents } = setup();
    storage.failWrites = true;
    await intents.set('custom');
    expect(intents.intent()).toBe('custom');
  });
});
