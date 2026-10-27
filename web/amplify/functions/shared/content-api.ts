/**
 * Server-to-server client for the content API (the Rails app in api/), using
 * the shared service token. Only for the /service routes; browsers never see
 * the token.
 */
export function contentApi(baseUrl: string, serviceToken: string) {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`Content API responded ${response.status}: ${await response.text()}`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: (path: string, body: unknown) => request<void>('POST', path, body),
  };
}
