import React from "react";
import { BRAND } from "@/lib/branding";

export function HomeFooter() {
  return (
    <footer
      aria-label="Informasi Footer"
      className="pt-2 pb-2 text-center text-[10.5px] text-neutral-400"
    >
      <p>© 2026 {BRAND.name}. All rights reserved.</p>
    </footer>
  );
}
