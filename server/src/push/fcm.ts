import type { Log } from '../extraction-handler';

/**
 * Sends push notifications with the Firebase Cloud Messaging HTTP v1 API.
 *
 * Credentials: on Cloud Run the service's own identity (the metadata server hands out short-lived
 * access tokens), so there is no key file to store or leak. The identity needs the
 * "Firebase Cloud Messaging API Admin" role. Off Google Cloud (local runs) there is no metadata server,
 * so sending fails and is logged; nothing else is affected.
 */

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  /** Small string fields the app reads when the notification is tapped (no health values: lock screens). */
  readonly data?: Readonly<Record<string, string>>;
}

/** Per token: delivered, gone (the app was uninstalled or the token rotated: forget it), or failed (try later). */
export type SendResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  send(token: string, message: PushMessage): Promise<SendResult>;
}

export interface FcmDeps {
  /** The Firebase project (the Google Cloud project id); null to read it from the metadata server. */
  readonly projectId: string | null;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly log: Log;
}

const METADATA = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_HEADERS = { 'metadata-flavor': 'Google' };
/** The Android channel the app creates for reminders (private on the lock screen). */
export const ANDROID_CHANNEL_ID = 'reminders';

export function createFcmSender({ projectId, fetch: http = fetch, now = Date.now, log }: FcmDeps): PushSender {
  let cached: { token: string; expiresAt: number } | null = null;
  let project: string | null = projectId;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt - 60_000 > now()) {
      return cached.token;
    }
    const response = await http(`${METADATA}/instance/service-accounts/default/token`, { headers: METADATA_HEADERS, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      throw new Error(`metadata token ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error('metadata token missing');
    }
    cached = { token: body.access_token, expiresAt: now() + (body.expires_in ?? 300) * 1000 };
    return cached.token;
  }

  async function projectIdOf(): Promise<string> {
    if (!project) {
      const response = await http(`${METADATA}/project/project-id`, { headers: METADATA_HEADERS, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) {
        throw new Error(`metadata project ${response.status}`);
      }
      project = (await response.text()).trim();
    }
    return project;
  }

  return {
    async send(token, message) {
      let response: Response;
      try {
        const [bearer, id] = await Promise.all([accessToken(), projectIdOf()]);
        response = await http(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(id)}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data ?? {},
              android: { priority: 'high', notification: { channel_id: ANDROID_CHANNEL_ID, visibility: 'PRIVATE' } },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        log('push.send-failed', { reason: 'unreachable', errorName: e instanceof Error ? e.name : typeof e });
        return 'failed';
      }
      if (response.ok) {
        return 'sent';
      }
      const body = (await response.json().catch(() => null)) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
      const code = body?.error?.details?.find((d) => d.errorCode)?.errorCode ?? body?.error?.status ?? 'unknown';
      // UNREGISTERED: the app was uninstalled or the token was replaced. (A 400 may be this server's own
      // mistake in the message, so it never deletes a token.)
      if (response.status === 404 || code === 'UNREGISTERED') {
        return 'gone';
      }
      log('push.send-failed', { status: response.status, code });
      return 'failed';
    },
  };
}
