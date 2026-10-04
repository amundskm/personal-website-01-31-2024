import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { codeInput } from "@sanity/code-input";
import { schemaTypes } from "./schemaTypes";
import { structure, SINGLETON_TYPES } from "./structure";

export default defineConfig({
  name: "default",
  title: "Personal Website",

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "xlnq5dny",
  dataset: process.env.SANITY_STUDIO_DATASET || "production",

  plugins: [structureTool({ structure }), codeInput(), visionTool()],

  schema: {
    types: schemaTypes,
    // Hide singletons from the global "Create new document" menu
    templates: (templates) =>
      templates.filter(({ schemaType }) => !SINGLETON_TYPES.has(schemaType)),
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
});
