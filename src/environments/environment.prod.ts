// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets.
export const environment = {
  production: true,
  /** null hides report upload: set the hosted HTTPS endpoint once the server is deployed (server/README.md). */
  inbodyExtractionEndpoint: null as string | null,
};
