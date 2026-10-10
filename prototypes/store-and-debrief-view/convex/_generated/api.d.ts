/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _view from "../_view.js";
import type * as http from "../http.js";
import type * as mcpTools from "../mcpTools.js";
import type * as oauth from "../oauth.js";
import type * as seed from "../seed.js";
import type * as store from "../store.js";
import type * as tools from "../tools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _view: typeof _view;
  http: typeof http;
  mcpTools: typeof mcpTools;
  oauth: typeof oauth;
  seed: typeof seed;
  store: typeof store;
  tools: typeof tools;
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
