import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { AuthResult } from '../../core/auth/auth-api';
import { AuthService, AuthState } from '../../core/auth/auth.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { RESTART_APP } from './account-data.service';
import { DeleteAccountPage } from './delete-account.page';

function fakeAuth(signedIn: boolean, answer: AuthResult<void> = { ok: true, value: undefined }) {
  const state = signal<AuthState>(
    signedIn ? { status: 'signed-in', user: { id: 'u1', email: 'me@example.test', name: 'Me', emailVerified: true }, verified: true } : { status: 'guest' },
  );
  return {
    state: state.asReadonly(),
    user: computed(() => {
      const s = state();
      return s.status === 'signed-in' ? s.user : null;
    }),
    deleteAccount: vi.fn(async () => {
      if (answer.ok) {
        state.set({ status: 'guest' });
      }
      return answer;
    }),
  };
}

async function render(auth: ReturnType<typeof fakeAuth>) {
  const storage = new MemoryKeyValueStorage();
  for (const key of ['fitness.profile', 'fitness.workout-logs', 'fitness.water-log', 'stokeform.notification-log', 'fitness.theme-preference', 'other.app']) {
    storage.values.set(key, '{}');
  }
  const restart = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => new Date(2026, 9, 22, 12, 0) },
      { provide: RESTART_APP, useValue: restart },
    ],
  });
  const fixture = TestBed.createComponent(DeleteAccountPage);
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const input = () => el.querySelector<HTMLInputElement>('[data-testid="delete-confirm-input"] input')!;
  const button = () => el.querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]')!;
  const type = async (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    await settle();
  };
  return { el, storage, restart, input, button, type, settle };
}

describe('DeleteAccountPage', () => {
  it('signed in: needs DELETE typed, deletes the account, erases this phone (keeping the theme) and starts afresh', async () => {
    const auth = fakeAuth(true);
    const { el, storage, restart, button, type, settle } = await render(auth);
    expect(el.textContent).toContain('me@example.test');
    expect(button().disabled).toBe(true);
    await type('delete');
    expect(button().disabled).toBe(true);
    await type('DELETE');
    expect(button().disabled).toBe(false);
    button().click();
    await settle();
    expect(auth.deleteAccount).toHaveBeenCalledTimes(1);
    expect([...storage.values.keys()].sort()).toEqual(['fitness.theme-preference', 'other.app']);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('a failed deletion keeps everything and says what to do', async () => {
    const auth = fakeAuth(true, { ok: false, error: 'network' });
    const { el, storage, restart, button, type, settle } = await render(auth);
    await type('DELETE');
    button().click();
    await settle();
    expect(el.textContent).toContain("You're offline");
    expect(storage.values.has('fitness.profile')).toBe(true);
    expect(restart).not.toHaveBeenCalled();
  });

  it('signed out: erases this phone only (no server call)', async () => {
    const auth = fakeAuth(false);
    const { el, storage, restart, button, type, settle } = await render(auth);
    expect(el.querySelector('h1')?.textContent).toContain('Erase data');
    await type('DELETE');
    button().click();
    await settle();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(storage.values.has('fitness.workout-logs')).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
