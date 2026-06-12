/**
 * Returns a 500 response when no AI Gateway credentials are available,
 * so the client surfaces a clear setup message instead of an empty stream.
 */
export function gatewayCredentialsError(): Response | null {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return null;
  }
  return new Response(
    "AI Gateway credentials missing. Set AI_GATEWAY_API_KEY in .env.local (see .env.example).",
    { status: 500 }
  );
}
