"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { X, Plus, Minus, Check, AlertCircle } from "lucide-react";
import { Product, SelectedOption, SelectedAddon } from "@/types";
import { PRODUCTS, formatRupiah } from "@/data/dummy-data";
import { parseOptionLabel } from "@/lib/option-utils";
import { useCart } from "@/context/CartContext";

interface QuickAddFormProps {
  product: Product;
  onClose: () => void;
}

function QuickAddForm({ product, onClose }: QuickAddFormProps) {
  const { addToCart } = useCart();
  const optionGroups = useMemo(() => product.optionGroups || [], [product.optionGroups]);
  const addons = useMemo(() => product.addons || [], [product.addons]);

  // Selections initialized per product instance
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initialOpts: Record<string, string> = {};
    optionGroups.forEach((group) => {
      if (group.required && group.values.length > 0) {
        initialOpts[group.id] = group.values[0].id;
      }
    });
    return initialOpts;
  });

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(() => new Set());
  const [quantity, setQuantity] = useState(1);
  const [itemNote, setItemNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Option selection handler
  const handleSelectOption = (groupId: string, valueId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [groupId]: valueId,
    }));
    setValidationError(null);
  };

  // Addon toggle handler
  const handleToggleAddon = (addonId: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  };

  // Dynamic price calculation
  const { totalPrice, resolvedOptions, resolvedAddons } = useMemo(() => {
    let delta = 0;
    const resolvedOpts: SelectedOption[] = [];

    optionGroups.forEach((group) => {
      const selectedValId = selectedOptions[group.id];
      if (selectedValId) {
        const val = group.values.find((v) => v.id === selectedValId);
        if (val) {
          delta += val.priceDelta;
          resolvedOpts.push({
            groupId: group.id,
            groupName: group.name,
            valueId: val.id,
            valueName: val.name,
            priceDelta: val.priceDelta,
          });
        }
      }
    });

    const resolvedAdds: SelectedAddon[] = [];
    addons.forEach((addon) => {
      if (selectedAddonIds.has(addon.id)) {
        delta += addon.price;
        resolvedAdds.push({
          addonId: addon.id,
          addonName: addon.name,
          price: addon.price,
        });
      }
    });

    const unit = product.basePrice + delta;
    return {
      totalPrice: unit * quantity,
      resolvedOptions: resolvedOpts,
      resolvedAddons: resolvedAdds,
    };
  }, [product.basePrice, optionGroups, addons, selectedOptions, selectedAddonIds, quantity]);

  // Confirm and add to cart
  const handleConfirmAddToCart = () => {
    // 1. Validate all required option groups
    for (const group of optionGroups) {
      if (group.required && !selectedOptions[group.id]) {
        setValidationError(`Silakan pilih opsi untuk "${group.name}".`);
        return;
      }
    }

    // 2. Add to cart (triggers the Lottie success animation in CartContext)
    addToCart(
      product,
      resolvedOptions,
      resolvedAddons,
      itemNote,
      quantity
    );

    // 3. Initiate smooth modal exit transition
    onClose();
  };

  const imageSrc = product.images?.[0] || "/images/hero-food.webp";

  return (
    <>
      {/* Mobile top pill grab handle */}
      <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

      {/* Modal Header */}
      <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-14 h-14 relative rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 border border-[#E5E5E5]">
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              unoptimized
              className="object-cover"
              sizes="56px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-medium bg-[#111111] text-white px-1.5 py-0.5 rounded tracking-wide inline-block mb-1">
              {product.categoryName}
            </span>
            <h2
              id="quick-add-title"
              className="text-xs sm:text-sm font-bold text-[#111111] truncate"
            >
              {product.name}
            </h2>
            <p className="text-xs font-semibold text-[#111111] mt-0.5">
              {formatRupiah(product.basePrice)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup modal"
          className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-[#111111] transition-colors flex-shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Modal Content */}
      <div className="overflow-y-auto px-4 py-3 space-y-3.5 flex-1 divide-y divide-neutral-100">
        {/* 1. Variant Option Groups */}
        {optionGroups.map((group) => {
          const selectedValId = selectedOptions[group.id];
          const isThreeCol = group.values.length === 3;

          return (
            <div key={group.id} className="pt-2 first:pt-0 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[#111111]">
                    {group.name}
                  </h3>
                  <p className="text-[10px] text-[#737373]">
                    {group.required ? "Pilih salah satu" : "Pilihan opsional"}
                  </p>
                </div>
                {group.required ? (
                  <span className="text-[9.5px] font-semibold text-[#F25B09] bg-orange-50 px-2 py-0.5 rounded-md">
                    Wajib
                  </span>
                ) : null}
              </div>

              <div
                className={`grid gap-1.5 ${
                  isThreeCol
                    ? "grid-cols-3"
                    : group.values.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {group.values.map((val) => {
                  const isSelected = selectedValId === val.id;
                  const { label, desc } = parseOptionLabel(val.name);

                  return (
                    <button
                      key={val.id}
                      type="button"
                      onClick={() => handleSelectOption(group.id, val.id)}
                      className={`min-w-0 p-2 rounded-xl border flex flex-col justify-between transition-colors min-h-[46px] text-left cursor-pointer ${
                        isSelected
                          ? "border-[#111111] bg-neutral-900 text-white"
                          : "border-[#E5E5E5] bg-white text-[#111111] hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1 min-w-0">
                        <span className="text-[10.5px] font-semibold truncate leading-tight">
                          {label}
                        </span>
                        <div
                          className={`w-3 h-3 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? "border-white bg-white"
                              : "border-[#737373]"
                          }`}
                        >
                          {isSelected ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#111111]" />
                          ) : null}
                        </div>
                      </div>

                      {desc ? (
                        <span
                          className={`text-[9px] truncate leading-tight mt-0.5 ${
                            isSelected
                              ? "text-neutral-300"
                              : "text-[#737373]"
                          }`}
                        >
                          {desc}
                        </span>
                      ) : null}

                      {val.priceDelta > 0 ? (
                        <span
                          className={`text-[9px] mt-0.5 font-medium ${
                            isSelected
                              ? "text-neutral-300"
                              : "text-[#737373]"
                          }`}
                        >
                          +{formatRupiah(val.priceDelta)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* 2. Add-on Selections */}
        {addons.length > 0 ? (
          <div className="pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#111111]">
                Tambahan / Ekstra (Add-on)
              </h3>
              <span className="text-[10px] text-[#737373]">Opsional</span>
            </div>

            <div className="space-y-1.5">
              {addons.map((addon) => {
                const isSelected = selectedAddonIds.has(addon.id);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => handleToggleAddon(addon.id)}
                    className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? "border-[#F25B09] bg-orange-50/40 text-[#111111]"
                        : "border-[#E5E5E5] bg-white text-[#111111] hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "border-[#F25B09] bg-[#F25B09] text-white"
                            : "border-[#737373]"
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : null}
                      </div>
                      <span className="text-xs font-medium text-left truncate">
                        {addon.name}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-[#F25B09] flex-shrink-0">
                      +{formatRupiah(addon.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 3. Seller Note Field */}
        <div className="pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="quickAddNote"
              className="text-xs font-semibold text-[#111111]"
            >
              Catatan Menu (Opsional)
            </label>
            <span className="text-[10px] text-[#737373]">
              {itemNote.length}/200
            </span>
          </div>
          <textarea
            id="quickAddNote"
            value={itemNote}
            onChange={(e) => setItemNote(e.target.value.slice(0, 200))}
            placeholder="Contoh: Sambal dipisah, daun kemangi diperbanyak..."
            rows={2}
            className="w-full p-2.5 bg-white border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder:text-[#737373] focus:outline-hidden focus:border-[#F25B09]"
          />
        </div>

        {/* Inline Validation Error */}
        {validationError ? (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#B42318] flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Action Bar */}
      <div className="p-3 sm:p-4 border-t border-[#E5E5E5] bg-white flex items-center justify-between gap-3 flex-shrink-0">
        {/* Quantity Controls */}
        <div className="flex items-center border border-[#E5E5E5] rounded-xl p-0.5 bg-neutral-50 flex-shrink-0">
          <button
            type="button"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Kurangi kuantitas"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#111111] disabled:opacity-30 min-h-[32px] min-w-[32px] hover:bg-neutral-100 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-7 text-center text-xs font-bold text-[#111111]">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            aria-label="Tambah kuantitas"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#111111] min-h-[32px] min-w-[32px] hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add to Cart Button */}
        <button
          type="button"
          onClick={handleConfirmAddToCart}
          className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-[#F25B09] hover:bg-[#D94D06] active:bg-[#D94D06] text-white flex items-center justify-between transition-colors shadow-sm cursor-pointer"
        >
          <span>Tambah ke Keranjang</span>
          <span>{formatRupiah(totalPrice)}</span>
        </button>
      </div>
    </>
  );
}

interface QuickAddModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

type ModalStatus = "closed" | "opening" | "open" | "closing";

export function QuickAddModal({ product, isOpen, onClose }: QuickAddModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [asyncProduct, setAsyncProduct] = useState<Product | null>(null);

  // Animation lifecycle states
  const [status, setStatus] = useState<ModalStatus>("closed");
  const [renderedProduct, setRenderedProduct] = useState<Product | null>(null);
  const [prevProduct, setPrevProduct] = useState<Product | null>(null);

  const statusRef = useRef<ModalStatus>("closed");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const historyPushedRef = useRef(false);

  // Check if reduced motion is requested
  const isReducedMotion = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Complete the dismissal, restore body scroll, and notify parent
  const finishClosing = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setStatus("closed");
    setRenderedProduct(null);
    setPrevProduct(null);
    onClose();
  }, [onClose]);

  // Centralized close function shared across X button, backdrop, Escape key, and Back button
  const requestClose = useCallback(
    (isBackAction: boolean = false) => {
      // Prevent duplicate close requests while closing or closed
      if (statusRef.current === "closing" || statusRef.current === "closed") {
        return;
      }

      // Revert history entry only if initiated from UI (not from browser popstate)
      if (!isBackAction && historyPushedRef.current) {
        historyPushedRef.current = false;
        try {
          window.history.back();
        } catch {
          // Ignore
        }
      } else {
        historyPushedRef.current = false;
      }

      // Set closing status immediately on the very first tap
      setStatus("closing");

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }

      if (isReducedMotion()) {
        finishClosing();
        return;
      }

      // Guarded fallback timeout: guarantees unmount at 350ms if transitionend is missed
      closeTimerRef.current = setTimeout(() => {
        finishClosing();
      }, 350);
    },
    [isReducedMotion, finishClosing]
  );

  // Synchronously adjust state during rendering when a new product is opened
  if (isOpen && product && product !== prevProduct) {
    setPrevProduct(product);
    setRenderedProduct(product);
    setStatus("opening");
  }

  // Handle external close when parent sets isOpen to false
  useEffect(() => {
    if (!isOpen && statusRef.current === "open") {
      requestClose(false);
    }
  }, [isOpen, requestClose]);

  // Handle transitionend event on the bottom sheet container
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Filter out transition events from child elements
    if (e.target !== sheetRef.current) return;
    if (e.propertyName !== "transform") return;

    if (statusRef.current === "closing") {
      finishClosing();
    }
  };

  // Handle asynchronous entrance transition via RAF and register history state
  useEffect(() => {
    if (status === "opening" && isOpen) {
      // Clear any pending close timers from rapid re-openings
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // Register a single history entry for mobile/browser Back button interception
      if (!historyPushedRef.current && typeof window !== "undefined") {
        historyPushedRef.current = true;
        try {
          window.history.pushState({ modal: "quick-add" }, "");
        } catch {
          // Ignore
        }
      }

      if (isReducedMotion()) {
        const raf = requestAnimationFrame(() => {
          setStatus("open");
        });
        return () => cancelAnimationFrame(raf);
      }

      // Double RAF ensures the initial off-screen (translateY 100%) frame is painted
      let r2: number;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => {
          setStatus("open");
        });
      });

      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
  }, [status, isOpen, isReducedMotion]);

  // Listen to browser / mobile Back button (popstate event)
  useEffect(() => {
    if (status === "closed") return;

    const handlePopState = () => {
      // User tapped browser or mobile Back button
      if (statusRef.current === "open" || statusRef.current === "opening") {
        requestClose(true); // true = history already popped by browser
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [status, requestClose]);

  // Handle Escape key
  useEffect(() => {
    if (status !== "open" && status !== "opening") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [status, requestClose]);

  // Lock body scroll while modal is active (opening, open, or closing)
  useEffect(() => {
    if (status === "closed") return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      historyPushedRef.current = false;
    };
  }, []);

  // Use the active product or preserved renderedProduct during closing
  const currentProduct = product || renderedProduct;

  // Synchronous resolution of options from product or dummy data
  const baseResolvedProduct = useMemo(() => {
    if (!currentProduct) return null;
    if (
      (currentProduct.optionGroups && currentProduct.optionGroups.length > 0) ||
      (currentProduct.addons && currentProduct.addons.length > 0)
    ) {
      return currentProduct;
    }

    const fallback = PRODUCTS.find(
      (p) => p.id === currentProduct.id || p.slug === currentProduct.slug
    );
    if (
      fallback &&
      ((fallback.optionGroups && fallback.optionGroups.length > 0) ||
        (fallback.addons && fallback.addons.length > 0))
    ) {
      return {
        ...currentProduct,
        optionGroups: fallback.optionGroups,
        addons: fallback.addons,
      };
    }

    return currentProduct;
  }, [currentProduct]);

  // Asynchronous fallback from Supabase catalog if needed
  useEffect(() => {
    if (!currentProduct || status === "closed") return;

    if (
      (currentProduct.optionGroups && currentProduct.optionGroups.length > 0) ||
      (currentProduct.addons && currentProduct.addons.length > 0)
    ) {
      return;
    }

    const fallback = PRODUCTS.find(
      (p) => p.id === currentProduct.id || p.slug === currentProduct.slug
    );
    if (fallback?.optionGroups?.length) return;

    let active = true;
    import("@/lib/supabase/catalog")
      .then(({ getProductBySlugOrId }) =>
        getProductBySlugOrId(currentProduct.dbId || currentProduct.id || currentProduct.slug)
      )
      .then((full) => {
        if (active && full) {
          setAsyncProduct({
            ...currentProduct,
            optionGroups: full.optionGroups,
            addons: full.addons,
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentProduct, status]);

  const activeProduct =
    asyncProduct && asyncProduct.id === currentProduct?.id
      ? asyncProduct
      : baseResolvedProduct;

  if (status === "closed" || !activeProduct) return null;

  const isOpeningOrOpen = status === "open";
  const isClosing = status === "closing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          requestClose(false);
        }
      }}
      style={{
        transition: isClosing
          ? "opacity 260ms cubic-bezier(0.4, 0, 1, 1)"
          : "opacity 320ms cubic-bezier(0, 0, 0.2, 1)",
      }}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs will-change-[opacity] ${
        isOpeningOrOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      } motion-reduce:transition-none`}
    >
      <div
        ref={sheetRef}
        onTransitionEnd={handleTransitionEnd}
        style={{
          transform: isOpeningOrOpen ? "translateY(0)" : "translateY(100%)",
          opacity: isOpeningOrOpen ? 1 : 0,
          transition: isClosing
            ? "transform 260ms cubic-bezier(0.4, 0, 1, 1), opacity 260ms cubic-bezier(0.4, 0, 1, 1)"
            : "transform 320ms cubic-bezier(0, 0, 0.2, 1), opacity 320ms cubic-bezier(0, 0, 0.2, 1)",
        }}
        className={`w-full max-h-[88vh] sm:max-h-[85vh] sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-[#E5E5E5] overflow-hidden will-change-[transform,opacity] ${
          isOpeningOrOpen ? "pointer-events-auto" : "pointer-events-none"
        } motion-reduce:transition-none motion-reduce:transform-none`}
      >
        <QuickAddForm
          key={activeProduct.id}
          product={activeProduct}
          onClose={() => requestClose(false)}
        />
      </div>
    </div>
  );
}
