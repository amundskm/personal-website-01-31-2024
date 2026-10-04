/**
 * Sanity connection settings. These values are public (they end up in the
 * browser bundle), so it is safe to commit them.
 *
 * Find your project ID at https://www.sanity.io/manage — it must match
 * SANITY_STUDIO_PROJECT_ID in studio/.env.
 */
export const sanityConfig = {
  projectId: 'xlnq5dny',
  dataset: 'production',
  apiVersion: '2025-02-19',
  /** Use the edge-cached API. Set to false to always read the freshest content. */
  useCdn: true,
} as const;

const PLACEHOLDER_PROJECT_ID: string = 'your-project-id';

export const isSanityConfigured = sanityConfig.projectId !== PLACEHOLDER_PROJECT_ID;
