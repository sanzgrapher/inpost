import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bridge, toolText } from "./bridge.js";

type RequestRow = {
  id: string;
  collectionId: string;
  folderId?: string | null;
  name: string;
  method: string;
  url: string;
  headersJson: string;
  body: string;
  sortOrder?: number;
};

type EnvRow = {
  id: string;
  name: string;
  isGlobal: boolean;
  isActive: boolean;
  varsJson: string;
};

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
    "List collections in a workspace (or all if workspaceId omitted)",
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
    "Create a collection in a workspace",
    {
      name: z.string().min(1).max(200),
      workspaceId: z.string().min(1),
    },
    async ({ name, workspaceId }) =>
      toolText(
        await bridge("POST", "/v1/collections", { name, workspaceId }),
      ),
  );

  server.tool(
    "list_requests",
    "List requests in a collection",
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
    "Get a request by id",
    { requestId: z.string().min(1) },
    async ({ requestId }) =>
      toolText(await bridge("GET", `/v1/requests/${requestId}`)),
  );

  server.tool(
    "create_request",
    "Create an HTTP request",
    {
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      method: z.string().default("GET"),
      url: z.string().min(1),
      headersJson: z.string().optional(),
      body: z.string().optional(),
      folderId: z.string().optional(),
    },
    async (args) => {
      const row: RequestRow = {
        id: crypto.randomUUID(),
        collectionId: args.collectionId,
        folderId: args.folderId ?? null,
        name: args.name,
        method: args.method || "GET",
        url: args.url,
        headersJson: args.headersJson ?? "[]",
        body: args.body ?? "",
      };
      return toolText(await bridge("POST", "/v1/requests", row));
    },
  );

  server.tool(
    "update_request",
    "Update an HTTP request",
    {
      requestId: z.string().min(1),
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      method: z.string(),
      url: z.string().min(1),
      headersJson: z.string().optional(),
      body: z.string().optional(),
    },
    async (args) => {
      const row: RequestRow = {
        id: args.requestId,
        collectionId: args.collectionId,
        name: args.name,
        method: args.method,
        url: args.url,
        headersJson: args.headersJson ?? "[]",
        body: args.body ?? "",
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
    "List environments (including Global)",
    {},
    async () => toolText(await bridge("GET", "/v1/environments")),
  );

  server.tool(
    "get_active_environment",
    "Get the active (non-global) environment",
    {},
    async () => toolText(await bridge("GET", "/v1/environments/active")),
  );

  server.tool(
    "create_environment",
    "Create an environment",
    {
      name: z.string().min(1).max(200),
      varsJson: z.string().optional(),
      isActive: z.boolean().optional(),
    },
    async (args) => {
      const env: EnvRow = {
        id: crypto.randomUUID(),
        name: args.name,
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
      name: z.string().min(1).max(200),
      varsJson: z.string(),
      isGlobal: z.boolean().optional(),
      isActive: z.boolean().optional(),
    },
    async (args) => {
      const env: EnvRow = {
        id: args.environmentId,
        name: args.name,
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
    "Set the active environment",
    { environmentId: z.string().min(1) },
    async ({ environmentId }) =>
      toolText(
        await bridge("POST", `/v1/environments/${environmentId}/activate`),
      ),
  );

  server.tool(
    "run_request",
    "Execute an HTTP request via the desktop app (uses active env unless environmentId given)",
    {
      requestId: z.string().min(1),
      environmentId: z.string().optional(),
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
    "import_openapi",
    "Import an OpenAPI 3.x JSON/YAML spec into a new collection",
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
    "Export a collection as OpenAPI 3.0.3 JSON",
    { collectionId: z.string().min(1) },
    async ({ collectionId }) =>
      toolText(
        await bridge("POST", "/v1/openapi/export", { collectionId }),
      ),
  );
}
