import { ChevronDownIcon, CopyIcon, UtensilsIcon } from "@/components/icons";
import ApproachPill from "@/components/plan/ApproachPill";
import type { EveningApproach } from "@/types/plan";

type DayAccordionProps = {
  day: string;
  meal: string;
  approach: EveningApproach;
  expanded: boolean;
  onToggle: () => void;
  onMealChange: (value: string) => void;
  onSelectApproach: (value: EveningApproach) => void;
  showCopy?: boolean;
  canCopy?: boolean;
  copying?: boolean;
  copyConfirming?: boolean;
  onCopy?: () => void;
  onCopyConfirm?: () => void;
  onCopyCancel?: () => void;
};

export default function DayAccordion({
  day,
  meal,
  approach,
  expanded,
  onToggle,
  onMealChange,
  onSelectApproach,
  showCopy = false,
  canCopy = false,
  copying = false,
  copyConfirming = false,
  onCopy,
  onCopyConfirm,
  onCopyCancel,
}: DayAccordionProps) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_10px_22px_-16px_rgba(17,17,17,0.16)]">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-[18px] py-4 text-left"
        >
          <span
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-colors ${
              expanded ? "bg-brand-gradient text-white" : "bg-badge-bg text-badge-text"
            }`}
          >
            <UtensilsIcon className="h-[15px] w-[15px]" />
          </span>
          <span className="flex-1 font-heading text-base uppercase tracking-wide text-foreground">
            {day}
          </span>
          {!expanded && meal && (
            <span className="max-w-[120px] truncate text-[12.5px] font-semibold text-muted sm:max-w-[160px]">
              {meal}
            </span>
          )}
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-black/35 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {showCopy &&
          (copyConfirming ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 py-2 text-[11px] font-semibold">
              <span className="max-w-[140px] leading-tight text-muted">
                Replace next week&apos;s {day}?
              </span>
              <button
                type="button"
                onClick={onCopyConfirm}
                disabled={copying}
                className="whitespace-nowrap text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
              >
                {copying ? "Copying…" : "Yes"}
              </button>
              <button
                type="button"
                onClick={onCopyCancel}
                disabled={copying}
                className="whitespace-nowrap text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onCopy}
              disabled={!canCopy || copying}
              aria-label={`Copy ${day} to next week`}
              title="Copy to next week"
              className="mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-badge-bg hover:text-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CopyIcon className="h-4 w-4" />
            </button>
          ))}
      </div>

      {expanded && (
        <div className="px-[18px] pb-5">
          <div className="mb-4 h-px bg-border" />

          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            Meal
          </p>
          <input
            type="text"
            value={meal}
            onChange={(e) => onMealChange(e.target.value)}
            placeholder="e.g. Grilled salmon, roasted veggies"
            className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange"
          />

          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">
            Approach
          </p>
          <div className="flex flex-wrap gap-2">
            <ApproachPill
              label="KCPT Meal Bank"
              selected={approach === "meal_bank"}
              onClick={() => onSelectApproach("meal_bank")}
            />
            <ApproachPill
              label="Orange Base"
              selected={approach === "orange_base"}
              onClick={() => onSelectApproach("orange_base")}
            />
            <ApproachPill
              label="My Own Meal"
              selected={approach === "own"}
              onClick={() => onSelectApproach("own")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
