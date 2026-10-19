/**
 * KCPT heart logo as a single-colour icon: /brand/heart-mark.png used as a CSS
 * mask, filled with the current text colour. The PNG has generous padding, so
 * the mask is scaled to 210% (same as the design) to make the heart fill the box.
 * Size it with width/height classes, colour it with a text-* class.
 */
export default function KcptHeartIcon({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        WebkitMaskImage: "url(/brand/heart-mark.png)",
        maskImage: "url(/brand/heart-mark.png)",
        WebkitMaskSize: "210%",
        maskSize: "210%",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      }}
    />
  );
}
