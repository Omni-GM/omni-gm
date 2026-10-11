import type { Infer } from "convex/values";
import type { draftResponse } from "../convex/debrief";

export type LedgerDraft = Infer<typeof draftResponse>;
export type DraftChange = LedgerDraft["draft"]["changes"][number];
export type LedgerRow = LedgerDraft["ledger"]["rows"][number];
export type LedgerScene = LedgerDraft["ledger"]["scenes"][number];
