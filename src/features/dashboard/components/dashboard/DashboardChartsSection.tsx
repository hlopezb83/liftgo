import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardChartsProps } from "./DashboardCharts";

const DashboardCharts = lazy(() => import("./DashboardCharts"));

export function DashboardChartsSection(props: DashboardChartsProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: section.closest("main"), rootMargin: "200px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const placeholder = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Skeleton className="h-72 rounded-xl xl:col-span-1" />
      <Skeleton className="h-72 rounded-xl xl:col-span-2" />
      {props.canSeeFinancials && <Skeleton className="h-80 rounded-xl xl:col-span-3" />}
    </div>
  );

  return (
    <div ref={sectionRef}>
      {visible ? (
        <Suspense fallback={placeholder}>
          <DashboardCharts {...props} />
        </Suspense>
      ) : placeholder}
    </div>
  );
}

