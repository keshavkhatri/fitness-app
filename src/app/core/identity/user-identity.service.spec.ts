import { TestBed } from '@angular/core/testing';

import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { NAME_MAX_LENGTH, UserIdentityService, normalizeName, parseUserIdentity } from './user-identity.service';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function setup(storage = new MemoryKeyValueStorage()) {
  TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }] });
  return { storage, service: TestBed.inject(UserIdentityService) };
}

describe('UserIdentityService', () => {
  it('names are trimmed, single-spaced and capped; blank is no name', () => {
    expect(normalizeName('  Alex   Morgan ')).toBe('Alex Morgan');
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(60))).toHaveLength(NAME_MAX_LENGTH);
    expect(normalizeName(42)).toBeNull();
  });

  it('saves and restores the name and photo', async () => {
    const { service, storage } = setup();
    expect(await service.save({ name: ' Alex ', photo: PHOTO })).toEqual({ name: 'Alex', photo: PHOTO });
    TestBed.resetTestingModule();
    expect(await setup(storage).service.load()).toEqual({ name: 'Alex', photo: PHOTO });
  });

  it('rejects photos that aren’t small image data URLs', async () => {
    const { service } = setup();
    await expect(service.save({ name: 'Alex', photo: 'https://example.com/me.jpg' })).rejects.toThrow(RangeError);
    await expect(service.save({ name: 'Alex', photo: `data:image/jpeg;base64,${'A'.repeat(400_000)}` })).rejects.toThrow(RangeError);
    expect(service.identity()).toEqual({ name: null, photo: null });
  });

  it('stored data is parsed strictly', () => {
    expect(parseUserIdentity({ version: 1, name: 'Alex', photo: 'javascript:alert(1)' })).toEqual({ name: 'Alex', photo: null });
    expect(parseUserIdentity({ version: 2, name: 'Alex' })).toEqual({ name: null, photo: null });
    expect(parseUserIdentity(null)).toEqual({ name: null, photo: null });
  });
});
