import { InjectionToken } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface HealthStepsStatus {
  /** Health Connect exists on this phone (Android 14 or newer). */
  readonly available: boolean;
  /** The person allowed this app to read steps. */
  readonly granted: boolean;
}

/** One local day's step total. */
export interface StepDay {
  /** "yyyy-MM-dd" */
  readonly date: string;
  readonly steps: number;
}

/**
 * The phone's step counter through Health Connect (Android 14+), behind a small seam: read-only, steps only. The web
 * build and older phones have none, so steps stay typed in there.
 */
export interface HealthStepsDevice {
  /** This build can talk to Health Connect at all (the Android app). */
  readonly supported: boolean;
  status(): Promise<HealthStepsStatus>;
  /** Shows the system's Health Connect permission dialog; resolves with the new status. */
  requestPermission(): Promise<HealthStepsStatus>;
  /** The last `days` days (1-30), today first. Rejects when not connected or Health Connect can't be read. */
  readSteps(days: number): Promise<readonly StepDay[]>;
  /** Opens this app's page in Health Connect's permission settings. */
  openSettings(): Promise<void>;
}

interface HealthStepsPlugin {
  status(): Promise<HealthStepsStatus>;
  requestPermission(): Promise<HealthStepsStatus>;
  readSteps(options: { days: number }): Promise<{ days: StepDay[] }>;
  openSettings(): Promise<void>;
}

function capacitorDevice(): HealthStepsDevice {
  const plugin = registerPlugin<HealthStepsPlugin>('HealthSteps');
  return {
    supported: true,
    status: () => plugin.status(),
    requestPermission: () => plugin.requestPermission(),
    readSteps: async (days) => (await plugin.readSteps({ days })).days,
    openSettings: () => plugin.openSettings(),
  };
}

/** No Health Connect (the web build, and tests): steps are typed in. */
export const NO_HEALTH_STEPS: HealthStepsDevice = {
  supported: false,
  status: async () => ({ available: false, granted: false }),
  requestPermission: async () => ({ available: false, granted: false }),
  readSteps: async () => {
    throw new Error('not-connected');
  },
  openSettings: async () => undefined,
};

export const HEALTH_STEPS_DEVICE = new InjectionToken<HealthStepsDevice>('HEALTH_STEPS_DEVICE', {
  providedIn: 'root',
  factory: () => (Capacitor.getPlatform() === 'android' ? capacitorDevice() : NO_HEALTH_STEPS),
});
