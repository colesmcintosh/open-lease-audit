/**
 * Optional MCP connectors a portfolio owner can attach to a run. Nothing here
 * is required — the audit works on the uploaded documents alone — but a
 * connected system of record turns "these two documents disagree" into "the
 * document disagrees with what you are actually billing", which is where the
 * recoverable money usually is.
 */
export interface ConnectorDef {
  id: string;
  name: string;
  vendor: string;
  blurb: string;
  /** Where the user gets their endpoint and authorizes access. */
  docsUrl: string;
  /** Prefilled endpoint, when the vendor publishes a fixed one. */
  defaultUrl: string;
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "yardi-virtuoso",
    name: "Yardi Virtuoso",
    vendor: "Yardi",
    blurb:
      "Property and asset management data — rent roll, charge schedules, work orders, financials. Lets the auditors check each lease against what your system actually records.",
    docsUrl: "https://claude.com/connectors/yardi-virtuoso",
    defaultUrl: "https://mcp.virtuoso.ai/mcp",
  },
  {
    id: "yardi-matrix",
    name: "Yardi Matrix",
    vendor: "Yardi",
    blurb:
      "Market intelligence — comparable rents, submarket performance, ownership. Lets the auditors judge whether a lease term is off-market enough to be a real exposure.",
    docsUrl: "https://claude.com/connectors/yardi-matrix",
    defaultUrl: "",
  },
];

/** User-supplied credentials for one connector. Never persisted. */
export interface ConnectorConfig {
  id: string;
  url: string;
  /** Bearer token, when the endpoint is not OAuth-authorized on your account. */
  token?: string;
}

export function connectorName(id: string): string {
  return CONNECTORS.find((connector) => connector.id === id)?.name ?? id;
}
