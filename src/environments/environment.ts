// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets (the OpenAI key lives in server/.env).
export const environment = {
  production: false,
  /** The local InBody extraction server (`npm run server:start`). */
  inbodyExtractionEndpoint: 'http://localhost:8787/v1/inbody-extractions' as string | null,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
