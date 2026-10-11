// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets.
export const environment = {
  production: true,
  /** null hides report upload: set the hosted HTTPS endpoint once the server is deployed (server/README.md). */
  inbodyExtractionEndpoint: null as string | null,
  /**
   * Exercise demonstration photos (free-exercise-db, public domain), pinned to
   * one commit; replace with the app's own host when there is one, or null to hide them.
   */
  exerciseMediaBaseUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/' as string | null,
};
