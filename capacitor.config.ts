import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stokeformfitness.app',
  // The name shown to people. `appId` is the installed app's identity (upgrades, signing, the Google sign-in
  // deep link, Firebase): changing it makes Android treat the app as a different one.
  appName: 'StokeForm',
  webDir: 'www'
};

export default config;
