import type { NutritionApproach } from "@/types/plan";

type NutritionApproachToggleProps = {
  value: NutritionApproach;
  onChange: (value: NutritionApproach) => void;
  disabled?: boolean;
};

const options: { value: NutritionApproach; label: string }[] = [
  { value: "orange_base", label: "Orange Base" },
  { value: "meal_bank", label: "KCPT Meal Bank" },
];

export default function NutritionApproachToggle({
  value,
  onChange,
  disabled = false,
}: NutritionApproachToggleProps) {
  const groupId = "nutrition-approach";

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0" disabled={disabled}>
      <legend
        id={`${groupId}-label`}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        Nutrition approach
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="flex gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-[0_10px_22px_-16px_rgba(17,17,17,0.16)]"
      >
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`;
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              id={optionId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange(option.value);
              }}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "bg-brand-gradient text-white shadow-[0_6px_14px_-6px_rgba(236,74,49,0.5)]"
                  : disabled
                    ? "text-muted"
                    : "cursor-pointer text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
