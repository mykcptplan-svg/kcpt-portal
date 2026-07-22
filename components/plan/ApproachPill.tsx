type ApproachPillProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
};

export default function ApproachPill({ label, selected, onClick }: ApproachPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors ${
        selected
          ? "bg-brand-gradient text-white shadow-[0_6px_14px_-6px_rgba(236,74,49,0.5)]"
          : "bg-background text-muted"
      }`}
    >
      {label}
    </button>
  );
}
