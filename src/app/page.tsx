import React, { Suspense } from "react";
import Image from "next/image";
import { getStoreSettings } from "@/lib/supabase/store-settings";
import { LandingOrderCta } from "@/components/home/LandingOrderCta";
import { WelcomeIntroAnimation } from "@/components/home/WelcomeIntroAnimation";

export const instant = false;

async function DynamicLandingOrderCta() {
  const settings = await getStoreSettings();
  return <LandingOrderCta isOpen={settings.isOpen} />;
}

export default function WelcomeLandingPage() {
  return (
    <div className="relative h-screen h-[100dvh] h-[100svh] min-h-[100svh] max-h-[100svh] w-full max-w-full overflow-hidden bg-black flex items-center justify-center">
      {/* Cinematic Full-screen Background with Subtle Blur and Contrast Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        <Image
          src="/images/bghomepage.webp"
          alt="Sajian Makanan Homemade Nook by Jina"
          fill
          priority
          className="object-cover object-[center_35%] sm:object-center select-none pointer-events-none scale-105 blur-[4px]"
          sizes="100vw"
        />
        {/* Dark translucent overlay + subtle vignette for rich foreground contrast */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/60 pointer-events-none" />
      </div>

      {/* First-visit Welcome Lottie Intro Animation */}
      <WelcomeIntroAnimation />

      {/* Centered Foreground Group (Crisp Logo + Pill ORDER Button) */}
      <main className="relative z-10 w-full max-w-sm mx-auto px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] flex flex-col items-center justify-center text-center animate-landing-fade max-h-full overflow-hidden no-scrollbar">
        {/* Brand White Logo for dark background */}
        <div className="relative w-36 sm:w-44 md:w-52 aspect-square max-w-[62vw] mb-4 sm:mb-6 flex items-center justify-center">
          <Image
            src="/images/homepagelogo.webp"
            alt="Nook by Jina"
            fill
            priority
            unoptimized
            className="object-contain select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
            sizes="(max-width: 640px) 144px, 208px"
          />
        </div>

        {/* Pill ORDER Button Immediately Below (Streaming Shell) */}
        <div className="w-full flex items-center justify-center min-h-[55px] sm:min-h-[60px]">
          <Suspense fallback={<LandingOrderCta isOpen={true} />}>
            <DynamicLandingOrderCta />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
