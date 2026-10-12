import { defineConfig, type WorkspaceOptions } from "sanity";
import { structureTool, type StructureResolver } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { codeInput } from "@sanity/code-input";
import { schemaTypes } from "./schemaTypes";
import {
  structure,
  membersStructure,
  SINGLETON_TYPES,
  PUBLIC_TYPES,
  MEMBER_TYPES,
} from "./structure";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "xlnq5dny";

/** Settings shared by both workspaces; each one only creates its own document types. */
function workspace(
  options: Pick<WorkspaceOptions, "name" | "title" | "basePath" | "dataset">,
  structureResolver: StructureResolver,
  creatableTypes: Set<string>,
): WorkspaceOptions {
  return {
    ...options,
    projectId,

    plugins: [structureTool({ structure: structureResolver }), codeInput(), visionTool()],

    schema: {
      types: schemaTypes,
      // Hide singletons and the other workspace's types from "Create new document"
      templates: (templates) =>
        templates.filter(
          ({ schemaType }) =>
            creatableTypes.has(schemaType) && !SINGLETON_TYPES.has(schemaType),
        ),
    },

    document: {
      // Singletons can only be published/discarded — not deleted or duplicated
      actions: (actions, { schemaType }) =>
        SINGLETON_TYPES.has(schemaType)
          ? actions.filter(
              ({ action }) =>
                action &&
                ["publish", "discardChanges", "restore"].includes(action),
            )
          : actions,
    },
  };
}

export default defineConfig([
  workspace(
    {
      name: "default",
      title: "Personal Website",
      basePath: "/site",
      dataset: process.env.SANITY_STUDIO_DATASET || "production",
    },
    structure,
    PUBLIC_TYPES,
  ),
  workspace(
    {
      name: "members",
      title: "Members only (private)",
      basePath: "/members",
      dataset: process.env.SANITY_STUDIO_PRIVATE_DATASET || "private",
    },
    membersStructure,
    MEMBER_TYPES,
  ),
]);
