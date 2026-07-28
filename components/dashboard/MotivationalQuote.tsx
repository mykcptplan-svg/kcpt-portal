type MotivationalQuoteProps = {
  text: string;
};

export default function MotivationalQuote({ text }: MotivationalQuoteProps) {
  return (
    <p className="font-script text-lg font-bold leading-snug text-brand-orange-dark">
      {text}
    </p>
  );
}
