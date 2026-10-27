import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || "xlnq5dny",
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  // Set this before running `npm run deploy` (becomes https://<hostname>.sanity.studio)
  studioHost: process.env.SANITY_STUDIO_HOSTNAME,
  deployment: {
    autoUpdates: true,
  },
});
