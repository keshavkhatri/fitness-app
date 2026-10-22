import { MemorySecretStore } from '../auth/session-store';
import { EncryptedKeyValueStorage } from './encrypted-key-value-storage';
import { MemoryKeyValueStorage } from './testing/memory-key-value-storage';

function setup(inner = new MemoryKeyValueStorage(), secrets = new MemorySecretStore()) {
  return { inner, secrets, storage: new EncryptedKeyValueStorage(inner, secrets) };
}

const PROFILE = JSON.stringify({ version: 2, profile: { dateOfBirth: '1990-01-01', weight: { kilograms: 94.5 } } });

describe('EncryptedKeyValueStorage', () => {
  it('stores values encrypted (nothing readable underneath) and reads them back', async () => {
    const { inner, secrets, storage } = setup();
    await storage.set('fitness.profile', PROFILE);
    const raw = inner.values.get('fitness.profile')!;
    expect(raw.startsWith('enc1:')).toBe(true);
    expect(raw).not.toContain('1990');
    expect(raw).not.toContain('94.5');
    expect(await storage.get('fitness.profile')).toBe(PROFILE);
    // The key is 256 bits, kept only in the secure store.
    expect(atob(secrets.values.get('storage-key')!).length).toBe(32);
  });

  it('the same value encrypts differently each time (a fresh IV per write)', async () => {
    const { inner, storage } = setup();
    await storage.set('a', 'same');
    await storage.set('b', 'same');
    expect(inner.values.get('a')).not.toBe(inner.values.get('b'));
  });

  it('another install (same key) reads it; a lost key reads as missing, never as an error', async () => {
    const { inner, secrets, storage } = setup();
    await storage.set('fitness.water-log', '{"days":{}}');
    expect(await new EncryptedKeyValueStorage(inner, secrets).get('fitness.water-log')).toBe('{"days":{}}');
    expect(await new EncryptedKeyValueStorage(inner, new MemorySecretStore()).get('fitness.water-log')).toBeNull();
  });

  it('reads values from before encryption as they are, and encrypts them once', async () => {
    const inner = new MemoryKeyValueStorage();
    inner.values.set('fitness.profile', PROFILE);
    inner.values.set('stokeform.plan-choice', '"auto"');
    inner.values.set('ionic-other-library', 'leave me');
    const { storage } = setup(inner);
    expect(await storage.get('fitness.profile')).toBe(PROFILE);
    expect(await storage.encryptExisting()).toBe(2);
    expect(inner.values.get('fitness.profile')!.startsWith('enc1:')).toBe(true);
    expect(inner.values.get('ionic-other-library')).toBe('leave me');
    expect(await storage.get('fitness.profile')).toBe(PROFILE);
    expect(await storage.encryptExisting()).toBe(0);
  });

  it('handles large values (a profile photo) and removes and lists keys', async () => {
    const { storage } = setup();
    const photo = 'x'.repeat(300_000);
    await storage.set('fitness.identity', photo);
    expect(await storage.get('fitness.identity')).toBe(photo);
    expect(await storage.keys()).toEqual(['fitness.identity']);
    await storage.remove('fitness.identity');
    expect(await storage.get('fitness.identity')).toBeNull();
  });
});
