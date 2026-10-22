import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stokeformfitness.app',
  // The name shown to people. `appId` is the installed app's identity (upgrades, signing, the Google sign-in
  // deep link, Firebase): changing it makes Android treat the app as a different one.
  appName: 'StokeForm',
  webDir: 'www',
  plugins: {
    // Local reminders use the same white status-bar icon and tint as server pushes (AndroidManifest.xml).
    LocalNotifications: { smallIcon: 'ic_stat_stokeform', iconColor: '#4D7C0F' },
  },
};

export default config;
