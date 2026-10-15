-- Namespaces. Better Auth (a later phase) owns `auth` and creates its tables there with its
-- own migration tooling; this repository never creates or alters them. Every Pulseform table
-- lives in `pulseform`, together with this tool's history (`pulseform.schema_migrations`).
CREATE SCHEMA IF NOT EXISTS pulseform;
CREATE SCHEMA IF NOT EXISTS auth;

COMMENT ON SCHEMA pulseform IS 'Pulseform domain data, owned by server/migrations. Rows are keyed by user_id (text), the Better Auth user id.';
COMMENT ON SCHEMA auth IS 'Reserved for Better Auth (user, session, account, verification). Not managed by server/migrations.';
