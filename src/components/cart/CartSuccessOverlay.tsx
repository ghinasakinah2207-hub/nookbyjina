"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import type { AnimationItem } from "lottie-web";

function getReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener?.("change", callback);
  return () => {
    mediaQuery.removeEventListener?.("change", callback);
  };
}

interface AnimationProps {
  onDismiss: () => void;
  reducedMotion: boolean;
}

function CartAnimationInstance({ onDismiss, reducedMotion }: AnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // If reduced motion is preferred, auto-dismiss after brief confirmation
    if (reducedMotion) {
      const timer = setTimeout(onDismiss, 1400);
      return () => clearTimeout(timer);
    }

    let isMounted = true;

    import("lottie-web/build/player/lottie_light")
      .then((lottieModule) => {
        if (!isMounted || !containerRef.current) return;

        const lottie = lottieModule.default || lottieModule;

        const anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          path: "/animations/one-click-order.json",
        });

        animRef.current = anim;

        anim.addEventListener("complete", () => {
          if (isMounted) onDismiss();
        });

        anim.addEventListener("data_failed", () => {
          if (isMounted) setHasError(true);
        });

        anim.addEventListener("error", () => {
          if (isMounted) setHasError(true);
        });
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      });

    // Safety fallback timer matching animation length (~2.5s) plus safety margin
    const safetyTimer = setTimeout(() => {
      if (isMounted) onDismiss();
    }, 2800);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [reducedMotion, onDismiss]);

  if (reducedMotion || hasError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 text-center px-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <p className="text-sm font-medium text-white tracking-wide drop-shadow-md">
          Ditambahkan ke keranjang
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-200">
      <div
        ref={containerRef}
        className="w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center overflow-hidden"
      />
      <p className="text-sm font-medium text-white tracking-wide -mt-2 drop-shadow-md">
        Ditambahkan ke keranjang
      </p>
    </div>
  );
}

export function CartSuccessOverlay() {
  const { cartSuccessEvent, dismissCartSuccess } = useCart();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false
  );

  if (!cartSuccessEvent) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onClick={dismissCartSuccess}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in duration-200 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto flex flex-col items-center justify-center"
      >
        <CartAnimationInstance
          key={cartSuccessEvent.id}
          onDismiss={dismissCartSuccess}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
