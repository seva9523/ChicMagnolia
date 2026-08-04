import { SUPPORTED_RETAILER_NAMES } from '@/retailers/catalog';

type SupportedRetailersProps = {
  heading?: string;
  className?: string;
};

export function SupportedRetailers({
  heading = 'Currently supported UK retailers',
  className = '',
}: SupportedRetailersProps) {
  return (
    <section
      aria-labelledby="supported-retailers-heading"
      className={className}
    >
      <p
        className="text-muted-foreground text-sm font-medium"
        id="supported-retailers-heading"
      >
        {heading}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {SUPPORTED_RETAILER_NAMES.map((retailer) => (
          <li
            className="bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 text-sm"
            key={retailer}
          >
            {retailer}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 text-sm">
        More retailers will be added during the private beta.
      </p>
    </section>
  );
}
