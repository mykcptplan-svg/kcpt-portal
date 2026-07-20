type MealListSectionProps = {
  title: string;
  idPrefix: string;
  values: string[];
  onChange: (values: string[]) => void;
  minRequired: number;
  maxItems: number;
  placeholder?: string;
};

// All current callers keep maxItems - minRequired <= 1, so at most one
// optional slot ever exists. Keys are index-based, so removing a non-last
// optional item would shift subsequent keys if that invariant is ever broken.
export default function MealListSection({
  title,
  idPrefix,
  values,
  onChange,
  minRequired,
  maxItems,
  placeholder = "Describe your meal",
}: MealListSectionProps) {
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

  function removeAt(index: number) {
    if (values.length > minRequired) {
      onChange(values.filter((_, i) => i !== index));
    }
  }

  const headingId = `${idPrefix}-heading`;

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-medium text-foreground">
        {title}
      </h2>

      {values.map((value, index) => {
        const inputId = `${idPrefix}-${index + 1}`;
        const isOptional = index >= minRequired;
        const labelText = isOptional
          ? `${title} ${index + 1} (optional)`
          : `${title} ${index + 1}`;

        return (
          <div key={inputId} className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-xs font-medium text-muted">
              {labelText}
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                type="text"
                value={value}
                onChange={(e) => updateAt(index, e.target.value)}
                placeholder={placeholder}
                aria-required={!isOptional}
                className="h-11 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:border-brand-orange focus:outline-none"
              />
              {isOptional && (
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${title} ${index + 1}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-brand-orange hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}

      {values.length < maxItems && (
        <button
          type="button"
          onClick={addSlot}
          aria-label={`Add another ${title}`}
          className="self-start text-xs font-medium text-brand-orange transition-opacity hover:opacity-90"
        >
          + Add another
        </button>
      )}
    </section>
  );
}
