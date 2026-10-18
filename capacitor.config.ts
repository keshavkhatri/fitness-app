import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fitnessapp.app',
  // The name shown to people. `appId` is the installed app's identity (upgrades, signing, the Google sign-in
  // deep link): it stays com.fitnessapp.app, not renamed with the brand.
  appName: 'StokeForm',
  webDir: 'www'
};

export default config;
