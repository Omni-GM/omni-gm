// PROTOTYPE — throwaway. The MCP tool surface (D6: few deep tools), declared for convex-mcp-gateway.
// Descriptions are part of the contract: they steer the AI.
import { defineMcpAction, defineMcpResource, type McpToolRegistration } from "convex-mcp-gateway";
import { internal } from "./_generated/api";
import { readArgs, debriefArgs, correctArgs, schemaArgs } from "./mcpTools";
import { DEBRIEF_VIEW_HTML } from "./_view";

export const DEBRIEF_VIEW_URI = "ui://omni-gm/draft-debrief";

export const tools: McpToolRegistration[] = [
  defineMcpAction({
    name: "story_read",
    description: [
      "Read the story state. Pick one view:",
      "overview: adventures and sessions in order, each with its debrief status. Start here.",
      "schema: entity kinds, their allowed properties, and relationship types. Read it before drafting; you cannot invent properties.",
      "entities: find entities by kind and/or nameContains (max 25). Use it to avoid duplicates.",
      "entity: one entity's properties and relationships by entityId; withHistory adds every past change with scene, transcript line, and why.",
    ].join("\n"),
    fn: internal.mcpTools.storyRead,
    args: readArgs,
    annotations: { readOnlyHint: true },
  }),
  defineMcpAction({
    name: "debrief",
    description: [
      "Work on a session's debrief: the draft of story-state changes from one session, scene by scene. Every action returns the current draft and shows it to the GM.",
      "open: start or update the draft with summary and shortSummary (for the GM's session note). Pass sessionId, or newSession {adventureId, playedOn, scenes[]} to record the played session first.",
      "propose: add changes. Each has scene (ordinal), change, transcript {line, quote}, and why. Record only what happened at the table, never plans or player guesses. Entities are referenced by id, or $tempKey for one created earlier in the same draft. Invalid changes are rejected one by one with a reason.",
      "drop: remove changes by changeIds when the GM rejects them. To fix a change, drop it and propose the corrected one.",
      "show: just show the draft.",
      "commit: apply the whole draft as one commit. Only when the GM says it is right.",
    ].join("\n"),
    fn: internal.mcpTools.debrief,
    args: debriefArgs,
    _meta: { ui: { resourceUri: DEBRIEF_VIEW_URI } },
  }),
  defineMcpAction({
    name: "story_correct",
    description: "Fix the committed story state outside a debrief, as one small commit with the reason the GM gave. All changes apply, or none.",
    fn: internal.mcpTools.storyCorrect,
    args: correctArgs,
  }),
  defineMcpAction({
    name: "schema_change",
    description:
      "Deliberately change the story-state schema: add a kind, add or retire a property, or add a relationship type. Only when the GM explicitly asks, never as part of a debrief. Recorded in the history with the reason.",
    fn: internal.mcpTools.schemaChange,
    args: schemaArgs,
  }),
];

export const resources = [
  defineMcpResource({
    uri: DEBRIEF_VIEW_URI,
    name: "draft-debrief",
    title: "Draft debrief",
    mimeType: "text/html;profile=mcp-app",
    read: async (_ctx, { uri }) => [{ uri, mimeType: "text/html;profile=mcp-app", text: DEBRIEF_VIEW_HTML }],
  }),
];
