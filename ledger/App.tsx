import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useState } from "react";
import type { LedgerDraft } from "./draft";
import { Ledger } from "./Ledger";

function isLedgerDraft(value: unknown): value is LedgerDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    "ledger" in value
  );
}

function errorText(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "The drop did not go through.";
}

export function App() {
  const [current, setCurrent] = useState<LedgerDraft | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const { app, error } = useApp({
    appInfo: { name: "omni-gm-ledger", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolresult = ({ structuredContent }) => {
        if (isLedgerDraft(structuredContent)) setCurrent(structuredContent);
      };
    },
  });
  useHostStyles(app, app?.getHostContext());

  async function drop(changeId: string): Promise<void> {
    if (!app || !current) return;
    setDropping(changeId);
    setDropError(null);
    try {
      const result = await app.callServerTool({
        name: "debrief_drop",
        arguments: { session: current.draft.session, changeIds: [changeId] },
      });
      if (result.isError) setDropError(errorText(result));
      else if (isLedgerDraft(result.structuredContent))
        setCurrent(result.structuredContent);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDropping(null);
    }
  }

  if (error)
    return <Notice>Could not connect to the host: {error.message}</Notice>;
  if (!current) return <Notice>Waiting for the draft debrief…</Notice>;
  return (
    <Ledger
      value={current}
      dropping={dropping}
      dropError={dropError}
      onDrop={drop}
    />
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-text-secondary">{children}</p>;
}
