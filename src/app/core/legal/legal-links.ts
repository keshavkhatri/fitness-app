import { InjectionToken } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/** StokeForm's website: the privacy policy, terms and contact live there (the app links to them). */
export const SITE_URL = 'https://stokeform.com';
export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
export const CONTACT_URL = `${SITE_URL}/contact`;
export const SUPPORT_EMAIL = 'support@stokeform.com';

/** Opens a web page outside the app: an in-app browser tab on the phone, a new tab on the web. */
export const OPEN_EXTERNAL = new InjectionToken<(url: string) => Promise<void>>('OPEN_EXTERNAL', {
  providedIn: 'root',
  factory: () => async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url, presentationStyle: 'popover' });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  },
});
