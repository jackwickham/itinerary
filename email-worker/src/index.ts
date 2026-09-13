/**
 * Cloudflare Email Worker: receives mail and
 * passes the raw message to the itinerary app's webhook. It is deliberately a dumb
 * pipe; sender checks and everything else happen in the app.
 *
 * If the app can't accept the email, the worker rejects it, so the sender gets a
 * bounce rather than silence.
 */

interface Env {
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
}

/** The subset of Cloudflare's ForwardableEmailMessage used here. */
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const body = await new Response(message.raw).arrayBuffer();

    let response: Response;
    try {
      response = await fetch(env.WEBHOOK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WEBHOOK_SECRET}`,
          "Content-Type": "message/rfc822",
          "X-Envelope-From": message.from,
          "X-Envelope-To": message.to,
        },
        body,
      });
    } catch (err) {
      message.setReject(
        `The itinerary app is unreachable (${String(err)}). Please try again later.`,
      );
      return;
    }

    if (response.status === 403) {
      message.setReject(
        "This address only accepts booking emails from approved senders.",
      );
    } else if (!response.ok) {
      message.setReject(
        `The itinerary app could not accept this email (HTTP ${response.status}).`,
      );
    }
  },
};
