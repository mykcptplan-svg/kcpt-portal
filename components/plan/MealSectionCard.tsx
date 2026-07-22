import type { ReactNode } from "react";

type MealSectionCardProps = {
  title: string;
  idPrefix: string;
  icon: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  minRequired: number;
  maxItems: number;
  placeholder?: string;
};

// All current callers keep maxItems - minRequired <= 1, so at most one
// optional slot ever exists. Keys are index-based, so removing a non-last
// optional item would shift subsequent keys if that invariant is ever broken.
export default function MealSectionCard({
  title,
  idPrefix,
  icon,
  values,
  onChange,
  minRequired,
  maxItems,
  placeholder = "Describe your meal",
}: MealSectionCardProps) {
  function updateAt(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function addSlot() {
    if (values.length < maxItems) {
      onChange([...values, ""]);
    }
  }

  const headingId = `${idPrefix}-heading`;
  const hasOptionalSlot = values.length > minRequired;
  const canAddMore = values.length < maxItems;

  return (
    <section
      className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-16px_rgba(17,17,17,0.16)]"
      aria-labelledby={headingId}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          {icon}
        </span>
        <h2
          id={headingId}
          className="font-heading text-base uppercase tracking-wide text-foreground"
        >
          {title}
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {values.map((value, index) => {
          const inputId = `${idPrefix}-${index + 1}`;
          const isOptional = index >= minRequired;
          const labelText = isOptional
            ? `${title} ${index + 1} (optional)`
            : `${title} ${index + 1}`;

          return (
            <div key={inputId} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-badge-bg text-xs font-extrabold text-badge-text"
              >
                {index + 1}
              </span>
              <label htmlFor={inputId} className="sr-only">
                {labelText}
              </label>
              <input
                id={inputId}
                type="text"
                value={value}
                onChange={(e) => updateAt(index, e.target.value)}
                placeholder={
                  isOptional ? `(optional) ${placeholder.toLowerCase()}` : placeholder
                }
                aria-required={!isOptional}
                className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange"
              />
            </div>
          );
        })}

        {canAddMore && !hasOptionalSlot && (
          <button
            type="button"
            onClick={addSlot}
            className="cursor-pointer self-start pl-8 text-left text-[12.5px] font-bold text-brand-orange-dark"
          >
            + Add another (optional)
          </button>
        )}
      </div>
    </section>
  );
}
