const OXYLABS_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries';

type OxylabsResult = {
  content?: unknown;
  status_code?: unknown;
};

type OxylabsResponse = {
  results?: OxylabsResult[];
};

export async function fetchOxylabsHtml(
  url: URL,
  credentials = {
    username: process.env.OXYLABS_USERNAME,
    password: process.env.OXYLABS_PASSWORD,
  },
): Promise<string> {
  if (!credentials.username || !credentials.password) {
    throw new Error('Oxylabs is not configured.');
  }

  const authorization = Buffer.from(
    `${credentials.username}:${credentials.password}`,
  ).toString('base64');

  const response = await fetch(OXYLABS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Basic ${authorization}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      source: 'universal',
      url: url.toString(),
      geo_location: 'United Kingdom',
      locale: 'en-GB',
      render: 'html',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    throw new Error(`Oxylabs returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as OxylabsResponse;
  const result = payload.results?.[0];
  const statusCode = Number(result?.status_code ?? 0);

  if (statusCode && statusCode >= 400) {
    throw new Error(`Oxylabs target returned HTTP ${statusCode}.`);
  }

  if (typeof result?.content !== 'string' || !result.content.trim()) {
    throw new Error('Oxylabs returned no page content.');
  }

  return result.content;
}
