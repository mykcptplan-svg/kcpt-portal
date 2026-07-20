import type { ReactNode } from "react";

type QuickAccessCardBase = {
  title: string;
  description: string;
  icon: ReactNode;
};

type ActiveCardProps = QuickAccessCardBase & {
  href: string;
  comingSoon?: never;
};

type ComingSoonCardProps = QuickAccessCardBase & {
  href?: never;
  comingSoon: true;
};

type QuickAccessCardProps = ActiveCardProps | ComingSoonCardProps;

const cardBaseClass =
  "flex flex-col gap-3 rounded-md border border-border p-5 transition-colors";

export default function QuickAccessCard(props: QuickAccessCardProps) {
  const { title, description, icon } = props;

  if (props.comingSoon) {
    return (
      <div
        role="group"
        aria-disabled="true"
        className={`${cardBaseClass} cursor-not-allowed opacity-60`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted" aria-hidden>
            {icon}
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            Coming soon
          </span>
        </div>
        <div>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <a
      href={props.href}
      className={`${cardBaseClass} hover:border-brand-orange focus-visible:border-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2`}
    >
      <span className="text-brand-orange" aria-hidden>
        {icon}
      </span>
      <div>
        <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
      </div>
    </a>
  );
}
