import type { NutritionApproach } from "@/types/plan";

type NutritionApproachToggleProps = {
  value: NutritionApproach;
  onChange: (value: NutritionApproach) => void;
};

const options: { value: NutritionApproach; label: string }[] = [
  { value: "orange_base", label: "Orange Base" },
  { value: "meal_bank", label: "KCPT Meal Bank" },
];

export default function NutritionApproachToggle({
  value,
  onChange,
}: NutritionApproachToggleProps) {
  const groupId = "nutrition-approach";

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend id={`${groupId}-label`} className="text-xs font-medium text-muted">
        Nutrition approach
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="flex gap-2"
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
              onClick={() => onChange(option.value)}
              className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-brand-orange text-black"
                  : "border border-border text-muted hover:text-foreground"
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
