import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export default function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVis(true);
          io.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transition: "opacity 0.65s ease, transform 0.65s cubic-bezier(0.2, 0.7, 0.25, 1)",
        transitionDelay: `${delay}ms`,
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : "translateY(18px)",
      }}
    >
      {children}
    </div>
  );
}
