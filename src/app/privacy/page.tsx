import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal-page';
import {
  LEGAL_CONTACT_PATH,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR_NAME,
  PRIVACY_VERSION,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy notice | ChicMagnolia',
  description:
    'How ChicMagnolia uses and protects personal data during the private beta.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      intro="This notice explains what personal data ChicMagnolia uses, why it is needed and the choices available to you."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <section>
        <h2>1. Who is responsible for your data</h2>
        <p>
          {LEGAL_OPERATOR_NAME} is the data controller for the personal data
          described in this notice. ChicMagnolia is currently operated as a
          private beta service from the United Kingdom.
        </p>
        <p>
          Privacy questions and rights requests can be submitted through the{' '}
          <Link href={LEGAL_CONTACT_PATH}>secure support form</Link>. Please do
          not include passwords, full payment-card details or other unnecessary
          sensitive information.
        </p>
      </section>

      <section>
        <h2>2. Data we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> email address, name, account
            identifiers, authentication status and account dates.
          </li>
          <li>
            <strong>Purchase data:</strong> retailer, product name and URL,
            purchase price, purchase and return dates, saved size and colour,
            and tracking status.
          </li>
          <li>
            <strong>Monitoring data:</strong> price-check results, stock status,
            timestamps, errors and price-drop notification history.
          </li>
          <li>
            <strong>Billing data:</strong> subscription status, billing-period
            dates and Stripe customer or subscription references. ChicMagnolia
            does not receive or store your full card number.
          </li>
          <li>
            <strong>Support data:</strong> the name, email address, topic and
            message submitted through the support form, the account identifier
            when signed in, delivery status, timestamps and the internal
            reference used to handle the request.
          </li>
          <li>
            <strong>Service and security data:</strong> limited technical logs
            needed to operate, secure and troubleshoot the service.
          </li>
          <li>
            <strong>Anonymous analytics:</strong> aggregated page-view
            information such as route, referrer, country, browser and device
            category. ChicMagnolia strips query strings before sending analytics
            events.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Where the data comes from</h2>
        <p>
          Most data is provided directly by you when you create an account, add
          a purchase, manage billing or submit the support form. Current price
          and stock information comes from public retailer pages for the product
          URL you provide. Subscription status comes from Stripe after signed
          webhook verification.
        </p>
      </section>

      <section>
        <h2>4. Why we use the data</h2>
        <ul>
          <li>
            <strong>To provide the service and perform our contract:</strong>{' '}
            authenticate you, store purchases, run price and stock checks, send
            requested alerts, provide data export, respond to support requests
            and manage the subscription.
          </li>
          <li>
            <strong>For legitimate interests:</strong> protect accounts, prevent
            abuse, diagnose failures, maintain reliability, keep an accountable
            support record and understand aggregated product use. These
            activities are limited to what is reasonably necessary for operating
            the service.
          </li>
          <li>
            <strong>To meet legal obligations:</strong> retain or disclose
            limited billing, tax, fraud-prevention or compliance records where
            the law requires it.
          </li>
        </ul>
        <p>
          ChicMagnolia does not sell personal data, use it for behavioural
          advertising or make solely automated decisions that have legal or
          similarly significant effects.
        </p>
      </section>

      <section>
        <h2>5. Service providers and recipients</h2>
        <p>ChicMagnolia uses specialist providers to operate the service:</p>
        <ul>
          <li>
            Supabase for authentication, the application database and support
            records.
          </li>
          <li>
            Vercel for application hosting and privacy-focused web analytics.
          </li>
          <li>
            Stripe for Checkout, recurring billing, invoices and the Customer
            Portal.
          </li>
          <li>
            Resend for authentication messages, transactional price-drop emails
            and support notifications.
          </li>
          <li>
            Oxylabs and, for selected retailer routes, Browserless to retrieve
            the public retailer page associated with a saved product URL.
          </li>
          <li>
            GitHub Actions to initiate the protected daily-monitoring endpoint.
          </li>
        </ul>
        <p>
          Providers receive only the information needed for their role. Product
          URLs, saved variant details and technical request data may be
          processed by scraping providers when a retailer check runs.
          ChicMagnolia may also disclose information where required by law, to
          protect users or to investigate misuse.
        </p>
      </section>

      <section>
        <h2>6. International processing</h2>
        <p>
          Some providers may process data outside the United Kingdom. Where this
          happens, ChicMagnolia relies on the provider&apos;s applicable
          transfer mechanism and contractual or organisational safeguards. Use
          the support form for more information about a particular provider or
          transfer.
        </p>
      </section>

      <section>
        <h2>7. Cookies and analytics</h2>
        <p>
          Supabase authentication uses cookies that are necessary to keep you
          signed in and protect dashboard access. Vercel Web Analytics is
          configured for aggregated analytics, does not use advertising cookies
          and is not used to follow you across other websites. ChicMagnolia does
          not currently use marketing or behavioural advertising cookies.
        </p>
      </section>

      <section>
        <h2>8. How long we keep data</h2>
        <ul>
          <li>
            Account, purchase, monitoring and notification data is generally
            kept while the account exists and is deleted when the account is
            deleted.
          </li>
          <li>
            Support, privacy-rights and security-report records are kept for as
            long as reasonably needed to respond, prevent abuse and demonstrate
            how the request was handled. Deleting an account removes the account
            link but does not automatically erase an unresolved support record.
          </li>
          <li>
            Failed-request and security records are kept only for as long as
            reasonably needed to troubleshoot, protect the service and establish
            or defend legal claims.
          </li>
          <li>
            Stripe and other providers may retain billing or compliance records
            under their own legal obligations even after the ChicMagnolia
            account is deleted.
          </li>
          <li>
            Backups and provider recovery systems may take a limited period to
            cycle out deleted data, during which it is not used for normal
            service activity.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Your rights</h2>
        <p>
          Depending on the circumstances, UK data-protection law may give you
          rights to access, correct, erase, restrict or object to processing and
          to receive portable data. The Settings page provides a JSON download
          and self-service account deletion. You can also submit a request
          through the support form if the self-service tools do not meet your
          request.
        </p>
        <p>
          You may complain to the UK Information Commissioner&apos;s Office.
          Details are available at{' '}
          <a
            href="https://ico.org.uk/make-a-complaint/"
            rel="noreferrer"
            target="_blank"
          >
            ico.org.uk
          </a>
          . We would appreciate the opportunity to address the concern first.
        </p>
      </section>

      <section>
        <h2>10. Account deletion</h2>
        <p>
          Deleting an account removes the Supabase authentication user and
          cascades deletion through the user-owned ChicMagnolia profile,
          purchases, price checks, notifications and subscription-state record.
          If a Stripe customer is linked, ChicMagnolia first requests deletion
          of that Stripe customer, which immediately ends active Stripe
          subscriptions and removes saved payment details from future use.
          Historical records may remain where Stripe or ChicMagnolia must retain
          them for legal, accounting, fraud-prevention, support or dispute
          purposes.
        </p>
      </section>

      <section>
        <h2>11. Security</h2>
        <p>
          ChicMagnolia uses authenticated access, database row-level security,
          server-only credentials, signed Stripe webhooks, encrypted HTTPS
          transport and restricted security headers. No internet service can
          guarantee absolute security, so please use a unique password and
          submit a security report through the support form if you believe an
          account has been compromised.
        </p>
      </section>

      <section>
        <h2>12. Changes to this notice</h2>
        <p>
          The current notice version is {PRIVACY_VERSION}. Material changes will
          be shown in the service or communicated before a new use of personal
          data begins. Earlier versions may be retained for accountability
          records.
        </p>
      </section>
    </LegalPage>
  );
}
