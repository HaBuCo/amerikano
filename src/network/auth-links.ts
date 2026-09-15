export type AuthLinkPayload = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  type?: string;
  flow?: string;
  error?: string;
};

function first(params: URLSearchParams[], key: string) {
  for (const entries of params) {
    const value = entries.get(key);
    if (value) return value;
  }
  return undefined;
}

export function parseAuthLink(url: string): AuthLinkPayload | null {
  if (!url) return null;

  const queryStart = url.indexOf('?');
  const fragmentStart = url.indexOf('#');
  const queryEnd = fragmentStart >= 0 ? fragmentStart : url.length;
  const query = queryStart >= 0
    ? new URLSearchParams(url.slice(queryStart + 1, queryEnd))
    : new URLSearchParams();
  const fragment = fragmentStart >= 0
    ? new URLSearchParams(url.slice(fragmentStart + 1))
    : new URLSearchParams();
  const sources = [fragment, query];
  const payload: AuthLinkPayload = {
    accessToken: first(sources, 'access_token'),
    refreshToken: first(sources, 'refresh_token'),
    code: first(sources, 'code'),
    type: first(sources, 'type'),
    flow: first(sources, 'flow'),
    error: first(sources, 'error_description') ?? first(sources, 'error'),
  };

  return Object.values(payload).some(Boolean) ? payload : null;
}

