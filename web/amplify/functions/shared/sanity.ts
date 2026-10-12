import { sanityConfig } from '../../../src/app/core/sanity.config';

/** A token-authenticated client for one Sanity dataset (the private one). */
export function sanityClient(dataset: string, token: string) {
  const base = `https://${sanityConfig.projectId}.api.sanity.io/v${sanityConfig.apiVersion}/data`;
  const headers = { Authorization: `Bearer ${token}` };

  return {
    async query<T>(groq: string, params: Record<string, unknown> = {}): Promise<T> {
      const search = new URLSearchParams({ query: groq, perspective: 'published' });
      for (const [key, value] of Object.entries(params)) {
        search.set(`$${key}`, JSON.stringify(value));
      }
      const response = await fetch(`${base}/query/${dataset}?${search}`, { headers });
      return ((await checked(response)) as { result: T }).result;
    },

    async mutate(mutations: unknown[]): Promise<void> {
      const response = await fetch(`${base}/mutate/${dataset}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutations }),
      });
      await checked(response);
    },
  };
}

async function checked(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Sanity responded ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
