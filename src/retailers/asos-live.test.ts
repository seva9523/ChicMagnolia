import { describe, expect, it } from 'vitest';

import { parseAsosProductHtml } from './asos';

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

describe('ASOS embedded live product data', () => {
  it('uses the exact product, colourway and selected-size current price and stock', () => {
    const available = parseAsosProductHtml(embeddedAsosHtml, productUrl, {
      size: 'S',
      colour: 'Grey marl',
    });
    const unavailable = parseAsosProductHtml(embeddedAsosHtml, productUrl, {
      size: 'M',
      colour: 'Grey marl',
    });

    expect(available.title).toBe(
      'ASOS DESIGN contrast lace detail v neck cami in grey marl',
    );
    expect(available.retailerProductId).toBe('154233432');
    expect(available.price).toEqual({ amountMinor: 599, currency: 'GBP' });
    expect(available.inStock).toBe(true);
    expect(unavailable.price.amountMinor).toBe(599);
    expect(unavailable.inStock).toBe(false);
  });

  it('does not borrow another colourway or another product price', () => {
    expect(() =>
      parseAsosProductHtml(embeddedAsosHtml, productUrl, {
        size: 'S',
        colour: 'Red',
      }),
    ).toThrow('ASOS saved colour does not match the product page.');
  });
});
