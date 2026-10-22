"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LottiePlayer, type LottiePlayerRef } from "@/components/ui/LottiePlayer";

const BACK_FROM_HOME_KEY = "temu_back_from_home";

export function WelcomeIntroAnimation() {
  const pathname = usePathname();
  // Server and initial client render start identically as "idle" (rendering null)
  // to guarantee 100% consistent initial hydration markup.
  const [phase, setPhase] = useState<"idle" | "playing" | "fading" | "unmounted">("idle");
  const playerRef = useRef<LottiePlayerRef>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    // If returning to "/" from another route (e.g. Back from /home), do not replay
    if (prevPathnameRef.current !== "/" && pathname === "/") {
      const frameId = requestAnimationFrame(() => {
        setPhase("unmounted");
      });
      return () => cancelAnimationFrame(frameId);
    }
    prevPathnameRef.current = pathname;

    // Check reduced motion preference safely after hydration
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isReduced) {
      return;
    }

    // Check if the user returned from /home via browser Back
    let isFromHome = false;
    try {
      isFromHome = sessionStorage.getItem(BACK_FROM_HOME_KEY) === "true";
      if (isFromHome) {
        // Clear flag after a short delay so React Strict Mode double-invocation preserves the check
        setTimeout(() => {
          try {
            sessionStorage.removeItem(BACK_FROM_HOME_KEY);
          } catch {}
        }, 500);
      }
    } catch {
      // Safe fallback for restricted storage environments
    }

    if (isFromHome) {
      return;
    }

    // Safe state update after hydration to begin the one-time welcome animation
    const frameId = requestAnimationFrame(() => {
      setPhase("playing");
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname]);

  const handleAnimationComplete = () => {
    if (phase !== "playing") return;

    // Step 1: Smooth fade-out (400ms)
    setPhase("fading");

    // Step 2: Unmount after fade completes (450ms)
    timerRef.current = setTimeout(() => {
      setPhase("unmounted");
    }, 450);
  };

  const handleAnimationError = () => {
    // If animation asset fails to load, unmount immediately
    setPhase("unmounted");
  };

  if (phase === "idle" || phase === "unmounted") {
    return null;
  }

  const isFading = phase === "fading";

  return (
    <div
      data-welcome-intro="true"
      aria-hidden="true"
      className={`
        pointer-events-none select-none z-20
        absolute left-1/2 -translate-x-1/2
        top-[max(1.5rem,calc(env(safe-area-inset-top,0px)+1rem))]
        sm:top-[max(2rem,calc(env(safe-area-inset-top,0px)+1.5rem))]
        flex items-center justify-center
        transition-all duration-400 ease-out
        ${isFading ? "opacity-0 scale-95" : "opacity-100 scale-100"}
      `}
    >
      <div className="relative w-[95px] sm:w-[112px] md:w-[121px] aspect-[428/123] flex items-center justify-center">
        <LottiePlayer
          ref={playerRef}
          path="/animations/welcome.json"
          autoplay={true}
          loop={false}
          speed={1}
          onComplete={handleAnimationComplete}
          onError={handleAnimationError}
          className="w-full h-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
        />
      </div>
    </div>
  );
}
