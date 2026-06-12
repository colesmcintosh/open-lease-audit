# Open Lease Audit

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-6-000000?logo=vercel&logoColor=white)](https://ai-sdk.dev)
[![AI Elements](https://img.shields.io/badge/AI%20Elements-workflow-000000?logo=vercel&logoColor=white)](https://ai-sdk.dev/elements)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/new)

A portfolio integrity console for commercial leases. Upload lease documents,
define the fields you care about, and watch a streaming pipeline abstract every
lease and reconcile the results across the portfolio — flagging mismatched
parties, conflicting terms, internal contradictions, and anomalies.

![Open Lease Audit console](.github/screenshot.png)

## Features

- **User-defined extraction schema** — columns with a name, plain-language
  description, and type (`text`, `number`, `currency`, `date`, `boolean`),
  compiled into a Zod schema at request time.
- **Streaming everywhere** — every lease runs through `streamObject`
  concurrently; partial fields render in the extraction matrix token by token,
  and audit findings stream in ranked by severity.
- **Evidence and confidence per field** — each extracted value carries a
  verbatim source clause (shown on hover) and a confidence grade.
- **Cross-lease auditing** — a second streaming pass reconciles the whole
  portfolio; flagged cells light up in the matrix and findings include a
  recommended action.
- **Live workflow canvas** — AI Elements workflow components render the
  pipeline (schema, per-document extraction, cross-lease audit, integrity
  report) with one-time handoff pulses as data moves between stages.
- **PDF and plain-text intake** — PDFs are sent to the model as native file
  parts; TXT and Markdown are read directly.

## How it works

```
Schema (user columns)
      |
      v
Document intake  -->  Streaming extraction (one stream per lease, concurrent)
                              |
                              v
                      Cross-lease audit (streaming reconciliation)
                              |
                              v
                      Integrity report (severity-ranked findings)
```

1. **Schema** — column definitions become a dynamic Zod schema with type
   guidance per field.
2. **Extract** — `/api/extract` streams a structured object per lease through
   the Vercel AI Gateway; the client parses partial JSON incrementally with
   `parsePartialJson`.
3. **Audit** — `/api/audit` reconciles all extracted rows and streams findings
   (severity, leases, columns, detail, recommendation) into the console.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # add your AI Gateway key
pnpm dev
```

Get a key at [vercel.com/docs/ai-gateway](https://vercel.com/docs/ai-gateway).
When deployed on Vercel, OIDC credentials are used automatically and no key is
required.

Use **Load sample portfolio** to try it instantly — three sample leases with
planted inconsistencies: entity-name drift across documents, a deposit that
contradicts its own "one month's rent" clause, conflicting expiration dates,
and divergent insurance and notice terms.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (local development) |
| `OPEN_LEASE_AUDIT_MODEL` | Optional `provider/model` override (default `anthropic/claude-sonnet-4-6`) |

## Architecture

| Path | Role |
| --- | --- |
| `app/api/extract/route.ts` | Streams structured extraction for one lease |
| `app/api/audit/route.ts` | Streams cross-lease findings |
| `lib/audit-schema.ts` | Dynamic Zod schema builder + audit result schema |
| `lib/stream-client.ts` | Partial-JSON streaming consumer |
| `hooks/use-audit-engine.ts` | Client pipeline state machine |
| `components/app/` | Console UI: schema builder, intake, canvas, matrix, findings |
| `components/ai-elements/` | Vendored AI Elements components (workflow canvas) |
| `public/samples/` | Sample lease portfolio with planted defects |

## Deploy

```bash
vercel
```

On Vercel, the AI Gateway authenticates via OIDC out of the box. To pin a key
instead, add `AI_GATEWAY_API_KEY` to the project environment.

## License

[MIT](LICENSE)
