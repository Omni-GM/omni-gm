/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as debrief from "../debrief.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as model from "../model.js";
import type * as oauth from "../oauth.js";
import type * as pagination from "../pagination.js";
import type * as schemaChanges from "../schemaChanges.js";
import type * as search from "../search.js";
import type * as skills from "../skills.js";
import type * as store from "../store.js";
import type * as tools from "../tools.js";
import type * as transcriptAppend from "../transcriptAppend.js";
import type * as uploadPage from "../uploadPage.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  debrief: typeof debrief;
  http: typeof http;
  ledger: typeof ledger;
  model: typeof model;
  oauth: typeof oauth;
  pagination: typeof pagination;
  schemaChanges: typeof schemaChanges;
  search: typeof search;
  skills: typeof skills;
  store: typeof store;
  tools: typeof tools;
  transcriptAppend: typeof transcriptAppend;
  uploadPage: typeof uploadPage;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  mcpGateway: import("convex-mcp-gateway/_generated/component.js").ComponentApi<"mcpGateway">;
};
