type TipsCardProps = {
  title: string;
  intro?: string;
  items: string[];
};

export default function TipsCard({ title, intro, items }: TipsCardProps) {
  return (
    <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
      <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
        {title}
      </h2>
      {intro != null && intro !== "" && (
        <p className="mt-2 text-[13.5px] font-semibold leading-relaxed text-foreground">
          {intro}
        </p>
      )}
      <ul className="mt-3.5 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange"
              aria-hidden
            />
            <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
              {item}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
