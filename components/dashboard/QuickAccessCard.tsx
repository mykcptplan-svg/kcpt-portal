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
  "flex flex-col gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[0_10px_22px_-14px_rgba(17,17,17,0.14)] transition-transform";

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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/10 text-muted" aria-hidden>
            {icon}
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            Coming soon
          </span>
        </div>
        <div>
          <h2 className="text-[14.5px] font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-[12.5px] leading-[1.35] text-muted">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <a
      href={props.href}
      className={`${cardBaseClass} hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange" aria-hidden>
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
