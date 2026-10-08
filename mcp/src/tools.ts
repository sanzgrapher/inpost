import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bridge, toolText } from "./bridge.js";

type RequestRow = {
  id: string;
  collectionId: string;
  folderId?: string | null;
  name: string;
  description?: string;
  method: string;
  url: string;
  headersJson: string;
  body: string;
  bodyType?: string;
  bodyPairsJson?: string;
  authType?: string;
  authJson?: string;
  pathVarsJson?: string;
  sortOrder?: number;
};

type EnvRow = {
  id: string;
  name: string;
  workspaceId: string;
  isGlobal: boolean;
  isActive: boolean;
  varsJson: string;
};

/**
 * Shared agent guidance: docs are OpenAPI-valid CommonMark, not rich-text JSON.
 * Kept short enough for tool descriptions but explicit about can / cannot.
 */
const DOC_FIELD_GUIDE = [
  "Documentation is CommonMark Markdown stored as a plain string.",
  "OpenAPI mapping: request.description → operation.description; collection.description → info.description.",
  "ALLOWED: # headings, paragraphs, **bold**, *italic*, ~~strike~~, -/* lists, 1. numbered lists, > quotes,",
  "`inline code`, fenced ```code blocks```, [links](https://…), ![images](https://…) via remote URL only, --- rules.",
  "NOT AVAILABLE: raw HTML/script (escaped, never executed); Editor.js / rich-text JSON; uploaded or pasted image files",
  "(no local image hosting — use https URLs); folder-level docs; structured OpenAPI schemas/examples inside the field",
  "(use request body/headers/auth fields for those). Empty string clears the docs.",
].join(" ");

const descriptionParam = z
  .string()
  .optional()
  .describe(
    "Markdown documentation for this request (OpenAPI operation.description). " +
      DOC_FIELD_GUIDE,
  );

const requestFields = {
  headersJson: z
    .string()
    .optional()
    .describe(
      'JSON string. Preferred: [["Accept","application/json"],["X-Id","{{id}}"]]. ' +
        'Also accepted: {"Accept":"application/json"} or [{"key":"Accept","value":"…","enabled":true}]. ' +
        "Values support {{envVar}}. Content-Type: application/json is added automatically for bodyType json when not set.",
    ),
  body: z.string().optional().describe("Raw body for bodyType json/text (supports {{envVar}})."),
  bodyType: z
    .enum(["none", "json", "text", "urlencoded", "multipart"])
    .optional()
    .describe(
      "Defaults to json when body is given, else none. urlencoded/multipart read bodyPairsJson and set Content-Type themselves.",
    ),
  bodyPairsJson: z
    .string()
    .optional()
    .describe(
      'Form fields for urlencoded/multipart: [{"key":"name","value":"Ada","type":"text","enabled":true}] or [["name","Ada"]]. ' +
        'Multipart type "file" is NOT uploaded yet: the value is sent as plain text.',
    ),
  authType: z
    .enum(["none", "bearer", "basic", "apikey"])
    .optional()
    .describe("Defaults to none."),
  authJson: z
    .string()
    .optional()
    .describe(
      'bearer: {"token":"…"} · basic: {"username":"…","password":"…"} · apikey: {"key":"X-Api-Key","value":"…","in":"header"|"query"}. Supports {{envVar}}.',
    ),
  pathVarsJson: z
    .string()
    .optional()
    .describe('Values for :id / {id} URL placeholders: [["id","42"]].'),
};

const collectionDescriptionParam = z
  .string()
  .describe(
    "Markdown documentation for this collection (OpenAPI info.description). " +
      DOC_FIELD_GUIDE,
  );

export function registerTools(server: McpServer) {
  server.tool(
    "list_workspaces",
    "List local workspaces",
    {},
    async () => toolText(await bridge("GET", "/v1/workspaces")),
  );

  server.tool(
    "create_workspace",
    "Create a workspace",
    { name: z.string().min(1).max(200) },
    async ({ name }) =>
      toolText(await bridge("POST", "/v1/workspaces", { name })),
  );

  server.tool(
    "list_collections",
    "List collections in a workspace (or all if workspaceId omitted). Each row includes description (Markdown / OpenAPI info.description).",
    { workspaceId: z.string().optional() },
    async ({ workspaceId }) =>
      toolText(
        await bridge(
          "GET",
          workspaceId
            ? `/v1/collections?workspaceId=${encodeURIComponent(workspaceId)}`
            : "/v1/collections",
        ),
      ),
  );

  server.tool(
    "create_collection",
    "Create a collection in a workspace. Optional description is collection-level documentation. " +
      DOC_FIELD_GUIDE,
    {
      name: z.string().min(1).max(200),
      workspaceId: z.string().min(1),
      description: collectionDescriptionParam.optional(),
    },
    async ({ name, workspaceId, description }) =>
      toolText(
        await bridge("POST", "/v1/collections", {
          name,
          workspaceId,
          description: description ?? "",
        }),
      ),
  );

  server.tool(
    "set_collection_description",
    "Set or clear a collection's documentation (shown in the app Docs tab; exports as OpenAPI info.description). " +
      DOC_FIELD_GUIDE,
    {
      collectionId: z.string().min(1),
      description: collectionDescriptionParam,
    },
    async ({ collectionId, description }) =>
      toolText(
        await bridge("PATCH", `/v1/collections/${collectionId}`, {
          description,
        }),
      ),
  );

  server.tool(
    "list_requests",
    "List requests in a collection (includes description Markdown when set)",
    { collectionId: z.string().min(1) },
    async ({ collectionId }) =>
      toolText(
        await bridge("GET", `/v1/collections/${collectionId}/requests`),
      ),
  );

  server.tool(
    "list_folders",
    "List folders in a collection",
    { collectionId: z.string().min(1) },
    async ({ collectionId }) =>
      toolText(
        await bridge("GET", `/v1/collections/${collectionId}/folders`),
      ),
  );

  server.tool(
    "create_folder",
    "Create a folder in a collection (unique sibling name auto-suffix)",
    {
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      parentId: z.string().optional(),
    },
    async ({ collectionId, name, parentId }) =>
      toolText(
        await bridge("POST", "/v1/folders", {
          collectionId,
          name,
          parentId: parentId ?? null,
        }),
      ),
  );

  server.tool(
    "delete_folder",
    "Delete a folder (contents move up to the parent)",
    { folderId: z.string().min(1) },
    async ({ folderId }) =>
      toolText(await bridge("DELETE", `/v1/folders/${folderId}`)),
  );

  server.tool(
    "rename_folder",
    "Rename a folder (unique sibling name auto-suffix)",
    {
      folderId: z.string().min(1),
      name: z.string().min(1).max(200),
    },
    async ({ folderId, name }) =>
      toolText(await bridge("PATCH", `/v1/folders/${folderId}`, { name })),
  );

  server.tool(
    "reorder_siblings",
    "Reorder/move folders and requests under a parent (null parent = collection root)",
    {
      collectionId: z.string().min(1),
      parentId: z.string().nullable().optional(),
      ordered: z.array(
        z.object({
          kind: z.enum(["folder", "request"]),
          id: z.string().min(1),
        }),
      ),
    },
    async ({ collectionId, parentId, ordered }) =>
      toolText(
        await bridge("POST", "/v1/reorder", {
          collectionId,
          parentId: parentId ?? null,
          ordered,
        }),
      ),
  );

  server.tool(
    "get_request",
    "Get a request by id (includes description Markdown / OpenAPI operation.description when set)",
    { requestId: z.string().min(1) },
    async ({ requestId }) =>
      toolText(await bridge("GET", `/v1/requests/${requestId}`)),
  );

  server.tool(
    "create_request",
    "Create an HTTP request. Optional description is request documentation shown in Overview. " +
      DOC_FIELD_GUIDE,
    {
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      description: descriptionParam,
      method: z.string().default("GET"),
      url: z.string().min(1),
      ...requestFields,
      folderId: z.string().optional(),
    },
    async (args) => {
      const row: RequestRow = {
        id: crypto.randomUUID(),
        collectionId: args.collectionId,
        folderId: args.folderId ?? null,
        name: args.name,
        description: args.description ?? "",
        method: args.method || "GET",
        url: args.url,
        headersJson: args.headersJson ?? "[]",
        body: args.body ?? "",
        bodyType: args.bodyType ?? (args.body ? "json" : "none"),
        bodyPairsJson: args.bodyPairsJson ?? "[]",
        authType: args.authType ?? "none",
        authJson: args.authJson ?? "{}",
        pathVarsJson: args.pathVarsJson ?? "[]",
      };
      return toolText(await bridge("POST", "/v1/requests", row));
    },
  );

  server.tool(
    "update_request",
    "Update an HTTP request. PATCH: only fields you pass change; omitted fields keep their saved values " +
      "(pass \"[]\" / \"\" to clear one). Changes apply to the next run_request immediately. " +
      DOC_FIELD_GUIDE,
    {
      requestId: z.string().min(1),
      collectionId: z.string().min(1).optional(),
      name: z.string().min(1).max(200).optional(),
      description: descriptionParam,
      method: z.string().optional(),
      url: z.string().min(1).optional(),
      ...requestFields,
    },
    async ({ requestId, ...args }) => {
      const existing = await bridge<RequestRow>("GET", `/v1/requests/${requestId}`);
      const patch = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined),
      );
      const row: RequestRow = { ...existing, ...patch, id: requestId };
      // A body sent to a bodyless request would otherwise be silently ignored.
      if (args.body && !args.bodyType && existing.bodyType === "none") row.bodyType = "json";
      return toolText(await bridge("PUT", `/v1/requests/${requestId}`, row));
    },
  );

  server.tool(
    "delete_request",
    "Delete a request",
    { requestId: z.string().min(1) },
    async ({ requestId }) =>
      toolText(await bridge("DELETE", `/v1/requests/${requestId}`)),
  );

  server.tool(
    "list_environments",
    "List environments in a workspace (including that workspace's Global)",
    { workspaceId: z.string().min(1) },
    async ({ workspaceId }) =>
      toolText(
        await bridge(
          "GET",
          `/v1/environments?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
      ),
  );

  server.tool(
    "get_active_environment",
    "Get the active (non-global) environment for a workspace",
    { workspaceId: z.string().min(1) },
    async ({ workspaceId }) =>
      toolText(
        await bridge(
          "GET",
          `/v1/environments/active?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
      ),
  );

  server.tool(
    "create_environment",
    "Create an environment in a workspace",
    {
      workspaceId: z.string().min(1),
      name: z.string().min(1).max(200),
      varsJson: z.string().optional(),
      isActive: z.boolean().optional(),
    },
    async (args) => {
      const env: EnvRow = {
        id: crypto.randomUUID(),
        name: args.name,
        workspaceId: args.workspaceId,
        isGlobal: false,
        isActive: args.isActive ?? true,
        varsJson: args.varsJson ?? "{}",
      };
      return toolText(await bridge("POST", "/v1/environments", env));
    },
  );

  server.tool(
    "update_environment",
    "Update environment name/vars/active flags",
    {
      environmentId: z.string().min(1),
      workspaceId: z.string().min(1),
      name: z.string().min(1).max(200),
      varsJson: z.string(),
      isGlobal: z.boolean().optional(),
      isActive: z.boolean().optional(),
    },
    async (args) => {
      const env: EnvRow = {
        id: args.environmentId,
        name: args.name,
        workspaceId: args.workspaceId,
        isGlobal: args.isGlobal ?? false,
        isActive: args.isActive ?? false,
        varsJson: args.varsJson,
      };
      return toolText(
        await bridge("PUT", `/v1/environments/${args.environmentId}`, env),
      );
    },
  );

  server.tool(
    "delete_environment",
    "Delete an environment. The workspace's Global environment cannot be deleted. If the deleted env was active, the first remaining non-global env (by name) becomes active.",
    { environmentId: z.string().min(1).describe("Id from list_environments") },
    async ({ environmentId }) =>
      toolText(await bridge("DELETE", `/v1/environments/${environmentId}`)),
  );

  server.tool(
    "set_active_environment",
    "Change the UI's active (non-global) environment. Prefer run_request({ environmentId }) when you only need one-off Local vs Prod runs — that does not flip the active env.",
    { environmentId: z.string().min(1) },
    async ({ environmentId }) =>
      toolText(
        await bridge("POST", `/v1/environments/${environmentId}/activate`),
      ),
  );

  server.tool(
    "run_request",
    [
      "Execute a saved HTTP request via the desktop app.",
      "Vars: Global env always merges in; the chosen non-global env supplies {{var}} / path values.",
      "Pass environmentId to run against that env for this call only (does NOT change the UI active env).",
      "Omit environmentId to use whatever is currently active.",
      "Compare Local vs Prod: call run_request twice with the same requestId and different environmentIds",
      "(from list_environments); compare status, resolvedUrl, and body in the two results.",
      "Both runs appear in History.",
    ].join(" "),
    {
      requestId: z.string().min(1).describe("Id from list_requests / get_request"),
      environmentId: z
        .string()
        .optional()
        .describe(
          "Non-global environment id from list_environments. Omit = use active env. Pass Local id then Prod id on two calls to compare the same request.",
        ),
    },
    async ({ requestId, environmentId }) =>
      toolText(
        await bridge("POST", "/v1/run", {
          requestId,
          environmentId: environmentId ?? null,
        }),
      ),
  );

  server.tool(
    "get_history",
    "Fetch one history snapshot by id (from UI Copy ID or list_workspace_history / list_request_history). Returns request+response snapshot including requestJson.",
    { historyId: z.string().min(1) },
    async ({ historyId }) =>
      toolText(await bridge("GET", `/v1/history/${encodeURIComponent(historyId)}`)),
  );

  server.tool(
    "list_workspace_history",
    "List recent request run history for a workspace (newest first). Use get_history with an entry id for the full snapshot.",
    {
      workspaceId: z.string().min(1),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ workspaceId, limit }) => {
      const q =
        limit != null
          ? `?limit=${encodeURIComponent(String(limit))}`
          : "";
      return toolText(
        await bridge(
          "GET",
          `/v1/workspaces/${encodeURIComponent(workspaceId)}/history${q}`,
        ),
      );
    },
  );

  server.tool(
    "list_request_history",
    "List recent run history for one saved request (newest first). Use get_history with an entry id for the full snapshot.",
    {
      requestId: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ requestId, limit }) => {
      const q =
        limit != null
          ? `?limit=${encodeURIComponent(String(limit))}`
          : "";
      return toolText(
        await bridge(
          "GET",
          `/v1/requests/${encodeURIComponent(requestId)}/history${q}`,
        ),
      );
    },
  );

  server.tool(
    "import_openapi",
    "Import an OpenAPI 3.x JSON/YAML spec into a new collection. Maps info.description → collection docs and operation.description → each request's description (Markdown).",
    {
      spec: z.string().min(1),
      workspaceId: z.string().min(1),
    },
    async ({ spec, workspaceId }) =>
      toolText(
        await bridge("POST", "/v1/openapi/import", { spec, workspaceId }),
      ),
  );

  server.tool(
    "export_openapi",
    "Export a collection as OpenAPI 3.0.3 JSON (includes collection description as info.description and each request description as operation.description)",
    { collectionId: z.string().min(1) },
    async ({ collectionId }) =>
      toolText(
        await bridge("POST", "/v1/openapi/export", { collectionId }),
      ),
  );
}
