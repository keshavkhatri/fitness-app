import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AUTH_API_BASE_URL, AUTH_FETCH } from '../../core/auth/auth-api';
import { AuthService, AuthState } from '../../core/auth/auth.service';
import { DEFAULT_REMINDER_SETTINGS, ReminderSettings } from '../../domain/reminders';
import { PUSH_DEVICE, PushDevice } from './push-device';
import { PushService } from './push.service';
import { ReminderPermission } from './reminder-device';
import { ReminderService } from './reminder.service';

const SIGNED_IN: AuthState = { status: 'signed-in', user: { id: 'u1', email: 'a@example.test', name: 'A', emailVerified: true }, verified: true };

function setup({ answer = (path: string) => new Response(path === '/v1/push/test' ? JSON.stringify({ devices: 1, sent: 1 }) : null, { status: path === '/v1/push/test' ? 200 : 204 }) } = {}) {
  const state = signal<AuthState>({ status: 'guest' });
  const settings = signal<ReminderSettings>({ ...DEFAULT_REMINDER_SETTINGS, enabled: true });
  const permission = signal<ReminderPermission>('granted');
  const hooks: ((token: string) => Promise<unknown>)[] = [];
  const calls: { path: string; body: unknown; auth: string }[] = [];
  let tokenHandler: (token: string) => void = () => undefined;
  const registers = { count: 0 };
  const device: PushDevice = {
    available: true,
    platform: 'android',
    register: async () => void registers.count++,
    unregister: async () => undefined,
    onToken: (h) => (tokenHandler = h),
    onTap: () => undefined,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PUSH_DEVICE, useValue: device },
      { provide: AUTH_API_BASE_URL, useValue: 'https://api.example' },
      {
        provide: AUTH_FETCH,
        useValue: async (url: string, init: RequestInit) => {
          const path = url.replace('https://api.example', '');
          calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>)['authorization'] });
          return answer(path);
        },
      },
      {
        provide: AuthService,
        useValue: {
          state,
          user: computed(() => {
            const s = state();
            return s.status === 'signed-in' ? s.user : null;
          }),
          token: async () => (state().status === 'signed-in' ? 'session-1' : null),
          onSignOut: (hook: (token: string) => Promise<unknown>) => hooks.push(hook),
        },
      },
      { provide: ReminderService, useValue: { settings, permission } },
    ],
  });
  const push = TestBed.inject(PushService);
  push.start();
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await new Promise((r) => setTimeout(r));
    }
  };
  return { push, state, settings, permission, hooks, calls, registers, giveToken: (t: string) => tokenHandler(t), settle };
}

describe('PushService', () => {
  it('registers this phone only when signed in with reminders on and allowed', async () => {
    const t = setup();
    await t.settle();
    expect(t.registers.count).toBe(0);

    t.state.set(SIGNED_IN);
    await t.settle();
    expect(t.registers.count).toBe(1);
    t.giveToken('fcm-token-1234567890abcdef');
    await t.settle();
    expect(t.calls).toEqual([{ path: '/v1/push/devices', body: { token: 'fcm-token-1234567890abcdef', platform: 'android' }, auth: 'Bearer session-1' }]);
    expect(t.push.registered()).toBe(true);
  });

  it('removes the phone when reminders are turned off, and at sign-out with the ending session', async () => {
    const t = setup();
    t.state.set(SIGNED_IN);
    t.giveToken('fcm-token-1234567890abcdef');
    await t.settle();

    t.settings.update((s) => ({ ...s, enabled: false }));
    await t.settle();
    expect(t.calls.at(-1)).toEqual({ path: '/v1/push/devices/remove', body: { token: 'fcm-token-1234567890abcdef' }, auth: 'Bearer session-1' });
    expect(t.push.registered()).toBe(false);

    t.settings.update((s) => ({ ...s, enabled: true }));
    await t.settle();
    expect(t.push.registered()).toBe(true);
    await Promise.all(t.hooks.map((h) => h('session-ending')));
    expect(t.calls.at(-1)).toEqual({ path: '/v1/push/devices/remove', body: { token: 'fcm-token-1234567890abcdef' }, auth: 'Bearer session-ending' });
  });

  it('reports what the test push did', async () => {
    const t = setup();
    t.state.set(SIGNED_IN);
    await t.settle();
    expect(await t.push.sendTest()).toBe('sent');
  });

  it('says when no phone of the account is connected', async () => {
    const none = setup({ answer: () => new Response(JSON.stringify({ devices: 0, sent: 0 }), { status: 200 }) });
    none.state.set(SIGNED_IN);
    expect(await none.push.sendTest()).toBe('no-device');
  });
});
