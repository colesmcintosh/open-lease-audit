const AUTH_HINTS = [
  "api key",
  "apikey",
  "authentication",
  "unauthorized",
  "credential",
  "not logged in",
  "invalid_api_key",
  "401",
];

export const SETUP_MESSAGE =
  "No Anthropic credentials. Set ANTHROPIC_API_KEY in .env.local (see .env.example), or sign in once with the Claude Code CLI on this machine.";

/**
 * The Agent SDK resolves credentials itself — an API key, a bearer token, or an
 * existing Claude Code login on the host — so there is nothing useful to check
 * before a run. We only translate an auth failure into a setup message, rather
 * than gating on an environment variable the SDK does not require.
 */
export function describeRunError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const haystack = message.toLowerCase();
  return AUTH_HINTS.some((hint) => haystack.includes(hint)) ? SETUP_MESSAGE : message;
}
