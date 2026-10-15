// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets.
export const environment = {
  production: true,
  /** The hosted extraction server on Google Cloud Run (server/CLOUD_RUN.md). null hides report upload. */
  inbodyExtractionEndpoint: 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app/v1/inbody-extractions' as string | null,
  /**
   * Exercise demonstration photos (free-exercise-db, public domain), pinned to
   * one commit; replace with the app's own host when there is one, or null to hide them.
   */
  exerciseMediaBaseUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/' as string | null,
};
