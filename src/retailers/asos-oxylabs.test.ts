import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAsosProductInteractive,
  normaliseAsosRequestUrl,
  parseAsosOxylabsHtml,
} from './asos-oxylabs';

const productUrl = new URL(
  'https://www.asos.com/asos-design/asos-design-contrast-lace-detail-v-neck-cami-in-grey-marl/prd/210111307#colourWayId-210111308',
);

const embeddedAsosHtml = `
  <html>
    <head>
      <meta property="og:title" content="ASOS DESIGN contrast lace detail v neck cami in grey marl | ASOS" />
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>your browser is not supported</h1>
      <script type="text/javascript">
        window.asos.pdp.config.stockPriceResponse = '[{"productId":205529533,"productPrice":{"current":{"value":22.5,"text":"£22.50"},"previous":{"value":25,"text":"£25.00"}},"hasMultiplePricesInStock":false,"variants":[]},{"productId":210111307,"productPrice":{"current":{"value":5.99,"text":"£5.99"},"previous":{"value":12,"text":"£12.00"}},"hasMultiplePricesInStock":false,"isInStock":true,"variants":[{"id":210111310,"isInStock":true,"price":{"current":{"value":5.99,"text":"£5.99"},"previous":{"value":12,"text":"£12.00"}}},{"id":210113438,"isInStock":false,"price":{"current":{"value":5.99,"text":"£5.99"},"previous":{"value":12,"text":"£12.00"}}},{"id":999999999,"isInStock":true,"price":{"current":{"value":1,"text":"£1.00"}}}]}]';
        window.asos.pdp.config.product = { id: 210111307, };
        window.asos.pdp.config.product = {"productCode":"154233432","name":"ASOS DESIGN contrast lace detail v neck cami in grey marl","id":210111307,"variants":[{"variantId":210111310,"size":"S - UK 8-10","brandSize":"S","colour":"GREY MARL","colourWayId":210111308,"sku":"154233449","isAvailable":true},{"variantId":210113438,"size":"M - UK 12-14","brandSize":"M","colour":"GREY MARL","colourWayId":210111308,"sku":"154233455","isAvailable":true},{"variantId":999999999,"size":"S - UK 8-10","brandSize":"S","colour":"RED","colourWayId":999999998,"sku":"OTHER","isAvailable":true}]};
      </script>
    </body>
  </html>
`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('ASOS Oxylabs route', () => {
  it('converts the colourway fragment into the scraper request query', () => {
    const requestUrl = normaliseAsosRequestUrl(productUrl);

    expect(requestUrl.hash).toBe('');
    expect(requestUrl.searchParams.get('colourWayId')).toBe('210111308');
    expect(requestUrl.pathname).toContain('/prd/210111307');
  });

  it('parses the current price and exact size stock from raw ASOS state', () => {
    const snapshot = parseAsosOxylabsHtml(embeddedAsosHtml, productUrl, {
      size: 'S',
      colour: 'Grey marl',
    });

    expect(snapshot.price.amountMinor).toBe(599);
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.canonicalUrl).toBe(productUrl.toString());
  });

  it('uses one direct Oxylabs raw request for an interactive ASOS check', async () => {
    vi.stubEnv('OXYLABS_USERNAME', 'test-user');
    vi.stubEnv('OXYLABS_PASSWORD', 'test-password');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ status_code: 200, content: embeddedAsosHtml }],
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await fetchAsosProductInteractive(productUrl, {
      size: 'S',
      colour: 'Grey marl',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://realtime.oxylabs.io/v1/queries',
    );
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      source: 'universal',
      url: expect.stringContaining('colourWayId=210111308'),
      geo_location: 'United Kingdom',
      locale: 'en-GB',
      render: 'html',
    });
    expect(requestBody).not.toHaveProperty('markdown');
    expect(snapshot.price.amountMinor).toBe(599);
  });
});
