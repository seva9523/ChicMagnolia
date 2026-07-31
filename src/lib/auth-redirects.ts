type RequestOriginInput = {
  canonicalOrigin: string;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
};

function firstHeaderValue(value: string | null | undefined): string | null {
  const first = value?.split(',')[0]?.trim();
  return first || null;
}

function hostnameWithoutWww(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

function isAllowedAuthHostname(candidate: string, canonical: string) {
  const candidateHostname = candidate.toLowerCase();
  const canonicalHostname = canonical.toLowerCase();

  return (
    candidateHostname === canonicalHostname ||
    hostnameWithoutWww(candidateHostname) === hostnameWithoutWww(canonicalHostname) ||
    candidateHostname.endsWith('.vercel.app') ||
    isLoopbackHostname(candidateHostname)
  );
}

/**
 * Keeps PKCE confirmation and recovery callbacks on the same browser origin that
 * initiated the flow, while refusing arbitrary Host-header destinations.
 */
export function resolveAuthRequestOrigin({
  canonicalOrigin,
  forwardedHost,
  host,
  forwardedProto,
}: RequestOriginInput): string {
  const canonical = new URL(canonicalOrigin);
  const requestHost = firstHeaderValue(forwardedHost) ?? firstHeaderValue(host);
  if (!requestHost || /[\s/@\\]/.test(requestHost)) return canonical.origin;

  const hostnameForProtocol = requestHost.replace(/^\[/, '').split(']')[0]?.split(':')[0] ?? '';
  const protocolHeader = firstHeaderValue(forwardedProto)?.toLowerCase();
  const protocol =
    protocolHeader === 'http' || protocolHeader === 'https'
      ? protocolHeader
      : isLoopbackHostname(hostnameForProtocol)
        ? 'http'
        : 'https';

  let candidate: URL;
  try {
    candidate = new URL(`${protocol}://${requestHost}`);
  } catch {
    return canonical.origin;
  }

  if (!isAllowedAuthHostname(candidate.hostname, canonical.hostname)) {
    return canonical.origin;
  }

  if (!isLoopbackHostname(candidate.hostname)) {
    if (candidate.protocol !== 'https:' || candidate.port) return canonical.origin;
  }

  return candidate.origin;
}

export function safeAuthNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';

  try {
    const parsed = new URL(value, 'https://chicmagnolia.invalid');
    if (parsed.origin !== 'https://chicmagnolia.invalid') return '/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/dashboard';
  }
}
