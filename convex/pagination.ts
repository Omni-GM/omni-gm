import { ConvexError, v } from "convex/values";

export const pageArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  limit: v.optional(v.number()),
};
export const pageInfo = {
  truncated: v.boolean(),
  nextCursor: v.union(v.string(), v.null()),
};
export function pageLimit(limit: number | undefined, fallback = 100): number {
  const value = limit ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > 200)
    throw new ConvexError("Use a limit from 1 to 200");
  return value;
}
export type Position = { stream: number; cursor: string | null; seen: number };
export function position(scope: string, value?: string | null): Position {
  if (!value) return { stream: 0, cursor: null, seen: 0 };
  try {
    if (value.length > 16000) throw new Error();
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("scope" in parsed) ||
      parsed.scope !== scope ||
      !("stream" in parsed) ||
      typeof parsed.stream !== "number" ||
      !Number.isSafeInteger(parsed.stream) ||
      parsed.stream < 0 ||
      !("seen" in parsed) ||
      typeof parsed.seen !== "number" ||
      !Number.isSafeInteger(parsed.seen) ||
      parsed.seen < 0 ||
      !("cursor" in parsed) ||
      !(typeof parsed.cursor === "string" || parsed.cursor === null)
    )
      throw new Error();
    return { stream: parsed.stream, cursor: parsed.cursor, seen: parsed.seen };
  } catch {
    throw new ConvexError(
      "Cursor does not belong to this read. Restart without a cursor.",
    );
  }
}
export function continuation(scope: string, next: Position): string {
  return JSON.stringify({ scope, ...next });
}
