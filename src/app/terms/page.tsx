import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal-page';
import {
  LEGAL_CONTACT_PATH,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR_NAME,
  TERMS_VERSION,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of service | ChicMagnolia',
  description: 'Terms for using the ChicMagnolia private beta service.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These terms apply when you create an account or use the ChicMagnolia private beta."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <section>
        <h2>1. About ChicMagnolia</h2>
        <p>
          {LEGAL_OPERATOR_NAME} is a UK private beta service that helps users
          monitor a saved fashion product&apos;s current price and
          selected-variant stock during a return window. Questions can be
          submitted through the{' '}
          <Link href={LEGAL_CONTACT_PATH}>support form</Link>.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and account security</h2>
        <p>
          You must be at least 18 and legally able to enter into a contract. You
          must provide accurate account information, protect your password and
          promptly tell us about suspected unauthorised use. You may not share
          an account in a way that defeats plan limits or security controls.
        </p>
      </section>

      <section>
        <h2>3. What the service does</h2>
        <p>
          You provide a retailer product URL, purchase information, saved size
          and colour, and the return deadline shown for your order. ChicMagnolia
          attempts to retrieve public retailer information and records current
          price and stock signals for the saved variant. When configured, it may
          email a price-drop alert if the saved item appears cheaper, in stock
          and still within the entered return window.
        </p>
      </section>

      <section>
        <h2>4. Important retailer limitations</h2>
        <ul>
          <li>
            Retailer websites, prices, promotions, stock, delivery and return
            rules can change without notice.
          </li>
          <li>
            ChicMagnolia is not affiliated with, sponsored by or endorsed by the
            supported retailers unless expressly stated.
          </li>
          <li>
            A check or alert is informational. The retailer page and your order
            documents remain authoritative.
          </li>
          <li>
            You are responsible for checking the exact product, colour, size,
            current price, stock and return deadline before buying, returning or
            contacting a retailer.
          </li>
          <li>
            ChicMagnolia cannot guarantee that a retailer will accept a return,
            honour a price, restock an item or keep a product page available.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Beta availability</h2>
        <p>
          The service is under active development. Retailer integrations may
          fail when a website changes or blocks automated access. We may repair,
          replace, pause or remove a retailer adapter and may impose reasonable
          limits needed to protect reliability or provider budgets. We will use
          reasonable care but do not promise uninterrupted, error-free or
          permanently available service.
        </p>
      </section>

      <section>
        <h2>6. Subscription and billing</h2>
        <p>
          While payments remain in Stripe test mode, no real charge is taken.
          When live billing is enabled, ChicMagnolia is intended to offer one
          recurring monthly plan at the price shown before Checkout. Stripe
          hosts Checkout, invoices, payment-method management and the Customer
          Portal.
        </p>
        <ul>
          <li>The plan renews monthly until cancelled.</li>
          <li>
            Cancellation through the Customer Portal normally takes effect at
            the end of the current paid period, and monitoring access remains
            until that period ends.
          </li>
          <li>
            Deleting the ChicMagnolia account is different: it requests
            immediate deletion of the linked Stripe customer and immediate
            ending of active subscriptions.
          </li>
          <li>
            Prices, renewal terms and any applicable taxes will be presented
            before a live purchase. ChicMagnolia will not introduce another plan
            or charge without showing the applicable terms.
          </li>
        </ul>
        <p>
          Nothing in these terms removes a statutory cancellation, refund or
          consumer right. Where the law gives you a stronger right, the law
          applies.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>
            use the service unlawfully, fraudulently or to infringe another
            person&apos;s rights;
          </li>
          <li>
            submit malicious links, code or data, or attempt to bypass access
            controls;
          </li>
          <li>
            probe, overload or interfere with the application, scheduler or
            provider accounts;
          </li>
          <li>
            resell the service, scrape it in bulk or use it to build a competing
            dataset;
          </li>
          <li>misrepresent ChicMagnolia data as a retailer guarantee.</li>
        </ul>
        <p>
          We may restrict or suspend access where reasonably necessary to
          investigate abuse, protect users, comply with law or prevent harm to
          the service.
        </p>
      </section>

      <section>
        <h2>8. Your content and licence</h2>
        <p>
          You keep ownership of information you submit. You give ChicMagnolia a
          limited permission to host, process, copy and transmit that
          information only as needed to provide, secure and improve the service.
          Do not submit data that you do not have the right to use.
        </p>
      </section>

      <section>
        <h2>9. Intellectual property</h2>
        <p>
          ChicMagnolia&apos;s software, design, branding and original content
          remain owned by their respective owner. Retailer names, product
          images, descriptions and trademarks belong to the relevant retailers
          or rights holders. These terms do not transfer ownership of either
          party&apos;s intellectual property.
        </p>
      </section>

      <section>
        <h2>10. Responsibility and liability</h2>
        <p>
          ChicMagnolia is responsible for losses that are a foreseeable result
          of our failure to use reasonable care or comply with these terms. We
          are not responsible for losses caused by retailer decisions,
          inaccurate information supplied by you, an unavailable retailer page,
          or events outside reasonable control. We do not exclude or limit
          liability where doing so would be unlawful, including liability for
          death or personal injury caused by negligence, fraud, or rights that
          consumer law does not allow us to exclude.
        </p>
      </section>

      <section>
        <h2>11. Ending use and account deletion</h2>
        <p>
          You may stop tracking products, cancel billing through Stripe or
          delete the account from Settings. Account deletion is designed to
          remove user-owned application data and immediately stop linked Stripe
          billing. Some billing, fraud-prevention, security, support or legal
          records may remain where retention is required or justified. See the
          Privacy notice for details.
        </p>
      </section>

      <section>
        <h2>12. Changes</h2>
        <p>
          These are terms version {TERMS_VERSION}. We may update them as the
          beta changes. We will make material changes reasonably prominent and,
          where required, ask users to accept the updated terms before
          continuing to use affected features.
        </p>
      </section>

      <section>
        <h2>13. Governing law</h2>
        <p>
          These terms are governed by the law of England and Wales. If you are a
          consumer, you may also benefit from mandatory protections and court
          rights in the part of the UK where you live. We encourage users to
          submit concerns through the support form first so that they can be
          addressed directly.
        </p>
      </section>
    </LegalPage>
  );
}
