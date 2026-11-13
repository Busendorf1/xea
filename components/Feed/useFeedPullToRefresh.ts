"use client";

import { useEffect, useRef, useState } from "react";

export function useFeedPullToRefresh(
  parentRef: React.RefObject<HTMLDivElement | null>,
  onRefresh: () => Promise<void>
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPullingRef = useRef(false);
  const isPullRefreshingRef = useRef(false);
  isPullRefreshingRef.current = isPullRefreshing;

  useEffect(() => {
    const scrollEl = parentRef.current?.parentElement || parentRef.current;
    if (!scrollEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (scrollEl.scrollTop <= 2 && !isPullRefreshingRef.current) {
        pullStartY.current = e.touches[0].clientY;
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isPullRefreshingRef.current) return;
      if (scrollEl.scrollTop > 2) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const deltaY = e.touches[0].clientY - pullStartY.current;
      if (deltaY > 0) {
        const pull = Math.min(Math.pow(deltaY, 0.82) * 2.2, 90);
        setPullDistance(pull);
        if (deltaY > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      setPullDistance((currentPull) => {
        if (currentPull >= 55 && !isPullRefreshingRef.current) {
          setIsPullRefreshing(true);
          if (typeof window !== "undefined") {
            (window as any).__xea_force_refresh = true;
          }
          onRefresh().finally(() => {
            setIsPullRefreshing(false);
            setPullDistance(0);
          });
          return 45;
        }
        return 0;
      });
    };

    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });
    scrollEl.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [parentRef, onRefresh]);

  return {
    pullDistance,
    isPullRefreshing,
    isActivelyPulling: isPullingRef.current,
  };
}
