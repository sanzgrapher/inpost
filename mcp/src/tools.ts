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
      headersJson: z.string().optional(),
      body: z.string().optional(),
      bodyType: z.string().optional(),
      bodyPairsJson: z.string().optional(),
      authType: z.string().optional(),
      authJson: z.string().optional(),
      pathVarsJson: z.string().optional(),
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
    "Update an HTTP request. Omit description to keep existing docs; pass description (including \"\") to set/clear. " +
      DOC_FIELD_GUIDE,
    {
      requestId: z.string().min(1),
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      description: descriptionParam,
      method: z.string(),
      url: z.string().min(1),
      headersJson: z.string().optional(),
      body: z.string().optional(),
      bodyType: z.string().optional(),
      bodyPairsJson: z.string().optional(),
      authType: z.string().optional(),
      authJson: z.string().optional(),
      pathVarsJson: z.string().optional(),
    },
    async (args) => {
      // Preserve docs when the agent omits description (omit ≠ clear).
      let description = args.description;
      if (description === undefined) {
        const existing = await bridge<RequestRow>(
          "GET",
          `/v1/requests/${args.requestId}`,
        );
        description = existing.description ?? "";
      }
      const row: RequestRow = {
        id: args.requestId,
        collectionId: args.collectionId,
        name: args.name,
        description,
        method: args.method,
        url: args.url,
        headersJson: args.headersJson ?? "[]",
        body: args.body ?? "",
        bodyType: args.bodyType ?? (args.body ? "json" : "none"),
        bodyPairsJson: args.bodyPairsJson ?? "[]",
        authType: args.authType ?? "none",
        authJson: args.authJson ?? "{}",
        pathVarsJson: args.pathVarsJson ?? "[]",
      };
      return toolText(
        await bridge("PUT", `/v1/requests/${args.requestId}`, row),
      );
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
