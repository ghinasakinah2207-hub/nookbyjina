"use client";

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { AnimationItem } from "lottie-web";

export interface LottiePlayerRef {
  play: () => void;
  pause: () => void;
  stop: () => void;
  playSegments: (
    segments: [number, number] | [number, number][],
    forceFlag?: boolean,
    loop?: boolean,
    onComplete?: () => void
  ) => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  goToAndPlay: (value: number, isFrame?: boolean) => void;
  setSpeed: (speed: number) => void;
  setDirection: (direction: 1 | -1) => void;
  setLoop: (loop: boolean | number) => void;
  isReady: () => boolean;
  getAnimationInstance: () => AnimationItem | null;
}

export interface LottiePlayerProps {
  path?: string;
  animationData?: unknown;
  autoplay?: boolean;
  loop?: boolean | number;
  speed?: number;
  initialSegment?: [number, number];
  className?: string;
  style?: React.CSSProperties;
  renderer?: "svg" | "canvas" | "html";
  rendererSettings?: Record<string, unknown>;
  onComplete?: () => void;
  onLoopComplete?: () => void;
  onDOMLoaded?: () => void;
  onError?: () => void;
  fallback?: React.ReactNode;
}

const DEFAULT_RENDERER_SETTINGS = { preserveAspectRatio: "xMidYMid meet" };

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

export const LottiePlayer = forwardRef<LottiePlayerRef, LottiePlayerProps>(
  function LottiePlayer(
    {
      path,
      animationData,
      autoplay = false,
      loop = false,
      speed = 1,
      initialSegment,
      className,
      style,
      renderer = "svg",
      rendererSettings = DEFAULT_RENDERER_SETTINGS,
      onComplete,
      onLoopComplete,
      onDOMLoaded,
      onError,
      fallback = null,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<AnimationItem | null>(null);
    const [hasError, setHasError] = useState(false);
    const segmentCompleteCleanupRef = useRef<(() => void) | null>(null);

    // Keep callback and config refs stable to avoid re-triggering player rebuilds
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onLoopCompleteRef = useRef(onLoopComplete);
    onLoopCompleteRef.current = onLoopComplete;
    const onDOMLoadedRef = useRef(onDOMLoaded);
    onDOMLoadedRef.current = onDOMLoaded;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const autoplayRef = useRef(autoplay);
    autoplayRef.current = autoplay;
    const loopRef = useRef(loop);
    loopRef.current = loop;
    const speedRef = useRef(speed);
    speedRef.current = speed;
    const initialSegmentRef = useRef(initialSegment);
    initialSegmentRef.current = initialSegment;
    const rendererSettingsRef = useRef(rendererSettings);
    rendererSettingsRef.current = rendererSettings;

    const reducedMotion = useSyncExternalStore(
      subscribeReducedMotion,
      getReducedMotion,
      () => false
    );

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          if (!reducedMotion) animRef.current?.play();
        },
        pause: () => animRef.current?.pause(),
        stop: () => animRef.current?.stop(),
        playSegments: (
          segments,
          forceFlag = true,
          shouldLoop = false,
          onSegmentComplete?: () => void
        ) => {
          if (!animRef.current) return;
          const anim = animRef.current;

          // Clear any pending segment completion callback
          if (segmentCompleteCleanupRef.current) {
            segmentCompleteCleanupRef.current();
            segmentCompleteCleanupRef.current = null;
          }

          anim.loop = reducedMotion ? false : shouldLoop;

          if (onSegmentComplete && !reducedMotion) {
            const handleComplete = () => {
              anim.removeEventListener("complete", handleComplete);
              segmentCompleteCleanupRef.current = null;
              onSegmentComplete();
            };
            anim.addEventListener("complete", handleComplete);
            segmentCompleteCleanupRef.current = () => {
              anim.removeEventListener("complete", handleComplete);
            };
          }

          if (reducedMotion) {
            const frame = Array.isArray(segments[0])
              ? segments[0][0]
              : segments[0];
            anim.goToAndStop(frame, true);
            if (onSegmentComplete) {
              onSegmentComplete();
            }
          } else {
            anim.playSegments(segments, forceFlag);
          }
        },
        goToAndStop: (value, isFrame = true) =>
          animRef.current?.goToAndStop(value, isFrame),
        goToAndPlay: (value, isFrame = true) => {
          if (reducedMotion) {
            animRef.current?.goToAndStop(value, isFrame);
          } else {
            animRef.current?.goToAndPlay(value, isFrame);
          }
        },
        setSpeed: (newSpeed) => animRef.current?.setSpeed(newSpeed),
        setDirection: (direction) => animRef.current?.setDirection(direction),
        setLoop: (newLoop) => {
          if (animRef.current) {
            animRef.current.loop = reducedMotion ? false : newLoop;
          }
        },
        isReady: () => animRef.current !== null,
        getAnimationInstance: () => animRef.current,
      }),
      [reducedMotion]
    );

    // Sync loop and speed without destroying instance
    useEffect(() => {
      if (animRef.current) {
        animRef.current.loop = reducedMotion ? false : loop;
      }
    }, [loop, reducedMotion]);

    useEffect(() => {
      if (animRef.current && speed !== 1) {
        animRef.current.setSpeed(speed);
      }
    }, [speed]);

    // Primary setup effect: only rebuilds when source, renderer, or reduced-motion changes
    useEffect(() => {
      let isMounted = true;

      if (!path && !animationData) {
        setHasError(true);
        onErrorRef.current?.();
        return;
      }

      import("lottie-web/build/player/lottie_light")
        .then((lottieModule) => {
          if (!isMounted || !containerRef.current) return;

          const lottie = lottieModule.default || lottieModule;

          if (animRef.current) {
            animRef.current.destroy();
            animRef.current = null;
          }

          const config: Record<string, unknown> = {
            container: containerRef.current,
            renderer,
            loop: reducedMotion ? false : loopRef.current,
            autoplay: reducedMotion ? false : autoplayRef.current,
            rendererSettings: rendererSettingsRef.current,
          };

          if (path) {
            config.path = path;
          } else if (animationData) {
            config.animationData = animationData;
          }

          if (initialSegmentRef.current && !reducedMotion) {
            config.initialSegment = initialSegmentRef.current;
          }

          const anim = lottie.loadAnimation(config as Parameters<typeof lottie.loadAnimation>[0]);
          animRef.current = anim;

          if (speedRef.current !== 1) {
            anim.setSpeed(speedRef.current);
          }

          anim.addEventListener("DOMLoaded", () => {
            if (!isMounted) return;
            if (reducedMotion) {
              const stopFrame = initialSegmentRef.current ? initialSegmentRef.current[0] : 0;
              anim.goToAndStop(stopFrame, true);
            }
            onDOMLoadedRef.current?.();
          });

          anim.addEventListener("complete", () => {
            if (isMounted) onCompleteRef.current?.();
          });

          anim.addEventListener("loopComplete", () => {
            if (isMounted) onLoopCompleteRef.current?.();
          });

          anim.addEventListener("data_failed", () => {
            if (isMounted) {
              setHasError(true);
              onErrorRef.current?.();
            }
          });

          anim.addEventListener("error", () => {
            if (isMounted) {
              setHasError(true);
              onErrorRef.current?.();
            }
          });
        })
        .catch(() => {
          if (isMounted) {
            setHasError(true);
            onErrorRef.current?.();
          }
        });

      return () => {
        isMounted = false;
        if (segmentCompleteCleanupRef.current) {
          segmentCompleteCleanupRef.current();
          segmentCompleteCleanupRef.current = null;
        }
        if (animRef.current) {
          animRef.current.destroy();
          animRef.current = null;
        }
      };
    }, [path, animationData, renderer, reducedMotion]);

    if (hasError && fallback) {
      return <>{fallback}</>;
    }

    return (
      <div
        ref={containerRef}
        className={className}
        style={style}
        aria-hidden="true"
      />
    );
  }
);
