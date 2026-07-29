export type PriceDropAlertCandidate = {
  purchasePricePence: number;
  currentPricePence: number;
  currency: string;
  inStock: boolean;
  returnDeadline: string;
};

export type PriceDropEmailInput = PriceDropAlertCandidate & {
  retailerName: string;
  productName: string;
  productUrl: string;
  dashboardUrl: string;
  size: string | null;
  colour: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(amountPence: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amountPence / 100);
  } catch {
    return `${currency} ${(amountPence / 100).toFixed(2)}`;
  }
}

export function isPriceDropAlertEligible(
  candidate: PriceDropAlertCandidate,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);

  return (
    candidate.inStock &&
    candidate.returnDeadline >= today &&
    candidate.currentPricePence > 0 &&
    candidate.purchasePricePence > candidate.currentPricePence
  );
}

export function buildPriceDropEmail(input: PriceDropEmailInput) {
  const savingsPence = input.purchasePricePence - input.currentPricePence;
  const savings = money(savingsPence, input.currency);
  const currentPrice = money(input.currentPricePence, input.currency);
  const purchasePrice = money(input.purchasePricePence, input.currency);
  const variant = [
    input.size ? `Size: ${input.size}` : null,
    input.colour ? `Colour: ${input.colour}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const productName = escapeHtml(input.productName);
  const retailerName = escapeHtml(input.retailerName);
  const productUrl = escapeHtml(input.productUrl);
  const dashboardUrl = escapeHtml(input.dashboardUrl);
  const variantMarkup = variant
    ? `<p style="margin:8px 0 0;color:#6b5d58;font-size:14px">${escapeHtml(variant)}</p>`
    : '';

  return {
    subject: `Price drop: save ${savings} on ${input.productName}`,
    html: `
      <div style="background:#fbf8f3;padding:32px 16px;font-family:Arial,sans-serif;color:#241b18">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadfd4;border-radius:18px;padding:28px">
          <p style="margin:0;color:#8f2f43;font-size:14px;font-weight:700">ChicMagnolia</p>
          <h1 style="margin:14px 0 8px;font-size:28px;line-height:1.2">The price dropped by ${savings}</h1>
          <p style="margin:0;color:#6b5d58;line-height:1.6">
            ${productName} at ${retailerName} is currently ${currentPrice}, down from the ${purchasePrice} you paid.
          </p>
          ${variantMarkup}
          <p style="margin:8px 0 0;color:#6b5d58;font-size:14px">Return by ${escapeHtml(input.returnDeadline)}</p>
          <div style="margin-top:24px">
            <a href="${productUrl}" style="display:inline-block;background:#8f2f43;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">View retailer page</a>
          </div>
          <p style="margin:22px 0 0;color:#85736b;font-size:13px;line-height:1.5">
            The alert is based on the latest daily check and the saved size and colour. Confirm the final price and availability with the retailer before returning or repurchasing.
          </p>
          <p style="margin:14px 0 0;font-size:13px">
            <a href="${dashboardUrl}" style="color:#8f2f43">Open your ChicMagnolia dashboard</a>
          </p>
        </div>
      </div>
    `,
  };
}
