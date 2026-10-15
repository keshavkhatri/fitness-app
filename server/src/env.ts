/**
 * Helpers for reading environment variables. Errors name the variable, never its value: a value
 * may be a secret (an API key, a database password) in a misconfigured environment.
 */
export type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {}

export const text = (env: Env, name: string): string | null => {
  const value = env[name]?.trim();
  return value ? value : null;
};

export function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = text(env, name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}
