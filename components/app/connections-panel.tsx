"use client";

import { useState } from "react";
import { Check, ExternalLink, Plug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConnectorConfig, ConnectorDef } from "@/lib/connectors";

interface ConnectionsPanelProps {
  catalog: ConnectorDef[];
  connectors: ConnectorConfig[];
  disabled: boolean;
  onConnect: (config: ConnectorConfig) => void;
  onDisconnect: (id: string) => void;
}

function ConnectorRow({
  connector,
  connected,
  disabled,
  onConnect,
  onDisconnect,
}: {
  connector: ConnectorDef;
  connected: ConnectorConfig | undefined;
  disabled: boolean;
  onConnect: (config: ConnectorConfig) => void;
  onDisconnect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(connector.defaultUrl);
  const [token, setToken] = useState("");

  const connect = () => {
    if (!url.trim()) return;
    onConnect({ id: connector.id, url: url.trim(), token: token.trim() || undefined });
    setOpen(false);
    setToken("");
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border bg-card/40 p-2.5 transition-colors",
        connected && "border-ok/40 bg-ok/5"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "status-dot mt-1 flex-none",
            connected ? "text-ok" : "text-muted-foreground/50"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold">{connector.name}</span>
            <a
              href={connector.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground/60 transition-colors hover:text-primary"
              title={`${connector.name} connector directory`}
            >
              <ExternalLink className="size-2.5" />
            </a>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {connector.blurb}
          </p>
        </div>
        {connected ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onDisconnect(connector.id)}
            className="h-6 flex-none rounded-sm px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:text-critical"
          >
            <X className="size-3" /> Drop
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setOpen((prev) => !prev)}
            className="h-6 flex-none rounded-sm px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-primary hover:text-primary"
          >
            <Plug className="size-3" /> Connect
          </Button>
        )}
      </div>

      {connected && (
        <p className="truncate border-l border-ok/40 pl-2 font-mono text-[9px] text-ok/80">
          <Check className="mr-1 inline size-2.5" />
          {connected.url}
          {connected.token ? " · token set" : " · no token"}
        </p>
      )}

      {open && !connected && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="MCP server URL"
            className="h-7 rounded-sm font-mono text-[10px]"
          />
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Bearer token (skip if the endpoint is OAuth-authorized)"
            type="password"
            className="h-7 rounded-sm font-mono text-[10px]"
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={!url.trim()}
              onClick={connect}
              className="h-6 rounded-sm px-2 font-mono text-[9px] uppercase tracking-[0.12em]"
            >
              Attach
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-6 rounded-sm px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          {!connector.defaultUrl && (
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Get your endpoint from the connector directory — the link above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Optional systems of record. When attached, the detector agents get the
 * connector's MCP tools and can check each lease against what the owner's
 * system actually bills and records.
 */
export function ConnectionsPanel({
  catalog,
  connectors,
  disabled,
  onConnect,
  onDisconnect,
}: ConnectionsPanelProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="microlabel">Systems of record</h2>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          {connectors.length}/{catalog.length} connected
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Optional. Attach a portfolio system and the auditors reconcile each lease
        against it — a term that disagrees with your rent roll is where the
        recoverable money usually is.
      </p>
      <div className="flex flex-col gap-1.5">
        {catalog.map((connector) => (
          <ConnectorRow
            key={connector.id}
            connector={connector}
            connected={connectors.find((entry) => entry.id === connector.id)}
            disabled={disabled}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        ))}
      </div>
      <p className="text-[9px] leading-relaxed text-muted-foreground/70">
        Credentials stay in this browser tab and are sent only with the audit
        request. Nothing is written back to a connected system.
      </p>
    </section>
  );
}
