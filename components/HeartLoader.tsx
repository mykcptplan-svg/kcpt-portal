"use client";

type HeartLoaderProps = {
  size?: number;
};

export default function HeartLoader({ size = 64 }: HeartLoaderProps) {
  return (
    <div
      role="status"
      className="heart-loader relative"
      style={{ width: size, height: size }}
    >
      <span className="sr-only">Loading</span>
      {/* Outline so the heart shape stays visible while filling */}
      <img
        src="/brand/heart-mark.png"
        alt=""
        className="heart-outline absolute inset-0 h-full w-full object-contain opacity-15"
        aria-hidden
      />
      <div className="heart-mask absolute inset-0 h-full w-full">
        <div className="fill bg-brand-orange" />
      </div>
      <style jsx>{`
        .heart-loader {
          position: relative;
          display: block;
        }
        .heart-outline,
        .heart-mask {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
        }
        .heart-mask {
          mask-image: url(/brand/heart-mark.png);
          -webkit-mask-image: url(/brand/heart-mark.png);
          mask-size: contain;
          -webkit-mask-size: contain;
          mask-repeat: no-repeat;
          -webkit-mask-repeat: no-repeat;
          mask-position: center;
          -webkit-mask-position: center;
        }
        .fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 0%;
          animation: heart-fill 1s ease-in-out infinite;
        }
        @keyframes heart-fill {
          from {
            height: 0%;
          }
          to {
            height: 100%;
          }
        }
      `}</style>
    </div>
  );
}
