"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { CartItem, Product, SelectedOption, SelectedAddon, ProductType } from "@/types";
import { PRODUCTS } from "@/data/dummy-data";
import { CartSuccessOverlay } from "@/components/cart/CartSuccessOverlay";
import { QuickAddModal } from "@/components/product/QuickAddModal";
import {
  getProductType,
  getCartProductType,
  normalizeProductType,
} from "@/lib/product-type";

interface CartContextType {
  cart: CartItem[];
  cartProductType: ProductType | null;
  isHydrated: boolean;
  addToCart: (
    product: Product,
    options: SelectedOption[],
    addons: SelectedAddon[],
    itemNote: string,
    quantity: number
  ) => void;
  updateQuantity: (itemId: string, newQuantity: number) => void;
  updateItemNote: (itemId: string, newNote: string) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
  hasSoldOutItem: boolean;
  orderNote: string;
  setOrderNote: (note: string) => void;
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  cartSuccessEvent: { id: number } | null;
  dismissCartSuccess: () => void;
  quickAddProduct: Product | null;
  openQuickAdd: (product: Product) => void;
  closeQuickAdd: () => void;
  updateCartItemOptions: (
    itemId: string,
    newOptions: SelectedOption[],
    newAddons: SelectedAddon[],
    newQuantity?: number,
    newItemNote?: string
  ) => void;
  buyNowItem: CartItem | null;
  setBuyNowItem: (item: CartItem | null) => void;
  clearBuyNowItem: () => void;
  selectedCartItemIds: Set<string>;
  selectedCartItems: CartItem[];
  selectedSubtotal: number;
  hasSoldOutSelected: boolean;
  toggleCartItemSelection: (itemId: string) => void;
  toggleSelectAllCartItems: () => void;
  setSelectedCartItemIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "temu_cart_items_v1";
const ORDER_NOTE_KEY = "temu_order_note_v1";
const FAVORITES_KEY = "temu_favorites_v1";
const BUY_NOW_STORAGE_KEY = "temu_buy_now_item_v1";
const SELECTED_CART_STORAGE_KEY = "temu_selected_cart_ids_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Initialize with hydration-safe defaults so SSR and initial client render produce identical markup
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<Set<string>>(() => new Set());
  const [buyNowItem, setBuyNowItemState] = useState<CartItem | null>(null);
  const [orderNote, setOrderNoteState] = useState<string>("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = React.useRef(false);

  // Single-type cart conflict dialog state
  const [pendingConflict, setPendingConflict] = useState<{
    product: Product;
    options: SelectedOption[];
    addons: SelectedAddon[];
    itemNote: string;
    quantity: number;
    currentType: ProductType;
    incomingType: ProductType;
  } | null>(null);

  // Restore persisted browser state after mounting
  useEffect(() => {
    queueMicrotask(() => {
      try {
        let parsedCart: CartItem[] = [];
        const storedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (storedCart) {
          const rawParsed: CartItem[] = JSON.parse(storedCart);
          parsedCart = rawParsed.map((item) => {
            const prod = PRODUCTS.find(
              (p) => p.id === item.productId || p.slug === item.productId
            );
            const normalizedOptions = Array.isArray(item.selectedOptions)
              ? item.selectedOptions.map((opt) => ({
                  ...opt,
                  groupId: opt.groupId || opt.optionName || "",
                  groupName: opt.groupName || opt.optionName || "",
                  valueId: opt.valueId || opt.optionValueId || "",
                  valueName: opt.valueName || opt.optionValue || "",
                  optionValueId: opt.optionValueId || opt.valueId || "",
                  optionValue: opt.optionValue || opt.valueName || "",
                  optionName: opt.optionName || opt.groupName || "",
                  priceDelta: Number(opt.priceDelta || 0),
                }))
              : [];
            return {
              ...item,
              selectedOptions: normalizedOptions,
              isAvailable: prod ? prod.isAvailable : (item.isAvailable ?? true),
              productType: item.productType
                ? normalizeProductType(item.productType)
                : prod
                ? getProductType(prod)
                : "preorder",
            };
          });
          setCart(parsedCart);
        }

        const storedSelection = localStorage.getItem(SELECTED_CART_STORAGE_KEY);
        if (storedSelection) {
          try {
            const parsedSelection = JSON.parse(storedSelection);
            if (Array.isArray(parsedSelection)) {
              const validIds = new Set<string>(
                parsedSelection.filter((id: string) =>
                  parsedCart.some((item) => item.id === id)
                )
              );
              setSelectedCartItemIds(validIds);
            }
          } catch {
            setSelectedCartItemIds(new Set(parsedCart.map((i) => i.id)));
          }
        } else {
          setSelectedCartItemIds(new Set(parsedCart.map((i) => i.id)));
        }

        const storedBuyNow = sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
        if (storedBuyNow) {
          try {
            const rawBuyNow = JSON.parse(storedBuyNow);
            if (rawBuyNow) {
              setBuyNowItemState({
                ...rawBuyNow,
                productType: normalizeProductType(rawBuyNow.productType),
              });
            }
          } catch {
            // Ignore
          }
        }

        const storedNote = localStorage.getItem(ORDER_NOTE_KEY);
        if (storedNote) {
          setOrderNoteState(storedNote);
        }

        const storedFavs = localStorage.getItem(FAVORITES_KEY);
        if (storedFavs) {
          setFavorites(JSON.parse(storedFavs));
        }
      } catch {
        // Ignore storage read errors
      } finally {
        isHydratedRef.current = true;
        setIsHydrated(true);
      }
    });
  }, []);

  const [cartSuccessEvent, setCartSuccessEvent] = useState<{ id: number } | null>(null);
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);

  const dismissCartSuccess = React.useCallback(() => {
    setCartSuccessEvent(null);
  }, []);

  const openQuickAdd = React.useCallback((product: Product) => {
    if (!product || !product.isAvailable) return;
    setQuickAddProduct(product);
  }, []);

  const closeQuickAdd = React.useCallback(() => {
    setQuickAddProduct(null);
  }, []);

  // Save cart to localStorage on changes (only after hydration to prevent wiping persisted state)
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore
    }
  }, [cart]);

  // Save order note
  const setOrderNote = React.useCallback((note: string) => {
    const trimmed = note.slice(0, 200);
    setOrderNoteState(trimmed);
    try {
      localStorage.setItem(ORDER_NOTE_KEY, trimmed);
    } catch {
      // Ignore
    }
  }, []);

  // Toggle favorite
  const toggleFavorite = React.useCallback((productId: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  }, []);

  const isFavorite = React.useCallback(
    (productId: string) => favorites.includes(productId),
    [favorites]
  );

  // Create composite deterministic key for grouping
  const createItemCompositeKey = React.useCallback(
    (
      productId: string,
      options: SelectedOption[],
      addons: SelectedAddon[],
      note: string
    ) => {
      const sortedOpts = [...options]
        .sort((a, b) => (a.groupId || a.optionName || "").localeCompare(b.groupId || b.optionName || ""))
        .map((o) => `${o.groupId || o.optionName}:${o.valueId || o.optionValueId}`)
        .join("|");

      const sortedAddons = [...addons]
        .sort((a, b) => a.addonId.localeCompare(b.addonId))
        .map((a) => a.addonId)
        .join("|");

      return `${productId}___opts:${sortedOpts}___addons:${sortedAddons}___note:${note.trim()}`;
    },
    []
  );

  const executeAddToCart = React.useCallback(
    (
      product: Product,
      options: SelectedOption[],
      addons: SelectedAddon[],
      itemNote: string,
      quantity: number,
      replaceCart: boolean = false
    ) => {
      if (quantity <= 0 || !product.isAvailable) return;

      const incomingType = getProductType(product);
      const trimmedNote = itemNote.slice(0, 200).trim();
      const normalizedOptions = options.map((opt) => ({
        ...opt,
        groupId: opt.groupId || opt.optionName || "",
        groupName: opt.groupName || opt.optionName || "",
        valueId: opt.valueId || opt.optionValueId || "",
        valueName: opt.valueName || opt.optionValue || "",
        optionValueId: opt.optionValueId || opt.valueId || "",
        optionValue: opt.optionValue || opt.valueName || "",
        optionName: opt.optionName || opt.groupName || "",
        priceDelta: Number(opt.priceDelta || 0),
      }));

      const itemId = createItemCompositeKey(
        product.id,
        normalizedOptions,
        addons,
        trimmedNote
      );

      const optionsDelta = normalizedOptions.reduce((sum, o) => sum + o.priceDelta, 0);
      const addonsDelta = addons.reduce((sum, a) => sum + a.price, 0);
      const unitPrice = product.basePrice + optionsDelta + addonsDelta;

      const newItem: CartItem = {
        id: itemId,
        productId: product.id,
        productName: product.name,
        productImage: product.images[0] || "/images/hero-food.webp",
        basePrice: product.basePrice,
        selectedOptions: normalizedOptions,
        selectedAddons: addons,
        itemNote: trimmedNote,
        quantity,
        unitPrice,
        itemTotal: unitPrice * quantity,
        isAvailable: product.isAvailable,
        productType: incomingType,
      };

      setCart((prev) => {
        if (replaceCart) {
          return [newItem];
        }

        const existingIndex = prev.findIndex((item) => item.id === itemId);
        if (existingIndex > -1) {
          // Merge identical item
          const existing = prev[existingIndex];
          const newQty = existing.quantity + quantity;
          const updated = [...prev];
          updated[existingIndex] = {
            ...existing,
            quantity: newQty,
            itemTotal: unitPrice * newQty,
            productType: incomingType,
          };
          return updated;
        } else {
          // Add as separate line item at index 0 (newest items appear first)
          return [newItem, ...prev];
        }
      });

      // Ensure newly added item is selected by default
      setSelectedCartItemIds((prev) => {
        const next = replaceCart ? new Set<string>([itemId]) : new Set(prev);
        if (!replaceCart) next.add(itemId);
        try {
          localStorage.setItem(
            SELECTED_CART_STORAGE_KEY,
            JSON.stringify(Array.from(next))
          );
        } catch {
          // Ignore
        }
        return next;
      });

      // Trigger cart success Lottie animation
      setCartSuccessEvent({ id: Date.now() });
    },
    [createItemCompositeKey]
  );

  const addToCart = React.useCallback(
    (
      product: Product,
      options: SelectedOption[],
      addons: SelectedAddon[],
      itemNote: string,
      quantity: number
    ) => {
      if (quantity <= 0 || !product.isAvailable) return;

      const incomingType = getProductType(product);
      const currentCartType = getCartProductType(cart);

      // Check single-type conflict if cart already contains items
      if (cart.length > 0 && currentCartType && currentCartType !== incomingType) {
        setPendingConflict({
          product,
          options,
          addons,
          itemNote,
          quantity,
          currentType: currentCartType,
          incomingType,
        });
        return;
      }

      executeAddToCart(product, options, addons, itemNote, quantity, false);
    },
    [cart, executeAddToCart]
  );

  const updateQuantity = React.useCallback(
    (itemId: string, newQuantity: number) => {
      if (newQuantity <= 0) {
        setCart((prev) => prev.filter((item) => item.id !== itemId));
        setSelectedCartItemIds((prev) => {
          if (!prev.has(itemId)) return prev;
          const next = new Set(prev);
          next.delete(itemId);
          try {
            localStorage.setItem(
              SELECTED_CART_STORAGE_KEY,
              JSON.stringify(Array.from(next))
            );
          } catch {
            // Ignore
          }
          return next;
        });
        return;
      }
      setCart((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantity: newQuantity,
                itemTotal: item.unitPrice * newQuantity,
              }
            : item
        )
      );
    },
    []
  );

  const updateItemNote = React.useCallback(
    (itemId: string, newNote: string) => {
      const trimmed = newNote.slice(0, 200);
      setCart((prev) => {
        const itemToEdit = prev.find((i) => i.id === itemId);
        if (!itemToEdit) return prev;

        // Re-generate ID based on new note
        const newId = createItemCompositeKey(
          itemToEdit.productId,
          itemToEdit.selectedOptions,
          itemToEdit.selectedAddons,
          trimmed
        );

        // Check if another item already exists with this identical configuration
        const existingIdentical = prev.find(
          (i) => i.id === newId && i.id !== itemId
        );

        if (existingIdentical) {
          // Merge with that item
          return prev
            .filter((i) => i.id !== itemId)
            .map((i) =>
              i.id === newId
                ? {
                    ...i,
                    quantity: i.quantity + itemToEdit.quantity,
                    itemTotal: i.unitPrice * (i.quantity + itemToEdit.quantity),
                  }
                : i
            );
        } else {
          // Just update this item
          return prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  id: newId,
                  itemNote: trimmed,
                }
              : i
          );
        }
      });
    },
    [createItemCompositeKey]
  );

  const removeFromCart = React.useCallback((itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
    setSelectedCartItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      try {
        localStorage.setItem(
          SELECTED_CART_STORAGE_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const updateCartItemOptions = React.useCallback(
    (
      itemId: string,
      newOptions: SelectedOption[],
      newAddons: SelectedAddon[],
      newQuantity?: number,
      newItemNote?: string
    ) => {
      setCart((prev) => {
        const itemToEdit = prev.find((i) => i.id === itemId);
        if (!itemToEdit) return prev;

        const resolvedNote =
          newItemNote !== undefined
            ? newItemNote.slice(0, 200).trim()
            : (itemToEdit.itemNote || "");

        const normalizedOptions = newOptions.map((opt) => ({
          ...opt,
          groupId: opt.groupId || opt.optionName || "",
          groupName: opt.groupName || opt.optionName || "",
          valueId: opt.valueId || opt.optionValueId || "",
          valueName: opt.valueName || opt.optionValue || "",
          optionValueId: opt.optionValueId || opt.valueId || "",
          optionValue: opt.optionValue || opt.valueName || "",
          optionName: opt.optionName || opt.groupName || "",
          priceDelta: Number(opt.priceDelta || 0),
        }));

        const newId = createItemCompositeKey(
          itemToEdit.productId,
          normalizedOptions,
          newAddons,
          resolvedNote
        );

        const optionsDelta = normalizedOptions.reduce(
          (sum, o) => sum + o.priceDelta,
          0
        );
        const addonsDelta = newAddons.reduce((sum, a) => sum + a.price, 0);
        const unitPrice = itemToEdit.basePrice + optionsDelta + addonsDelta;
        const targetQty =
          newQuantity !== undefined && newQuantity > 0
            ? newQuantity
            : itemToEdit.quantity;

        // Check if another item in the cart has this new composite key (excluding current item)
        const existingIdentical = prev.find(
          (i) => i.id === newId && i.id !== itemId
        );

        // Keep selection state synchronized with new item ID
        if (newId !== itemId) {
          setSelectedCartItemIds((prevSelection) => {
            if (!prevSelection.has(itemId)) return prevSelection;
            const next = new Set(prevSelection);
            next.delete(itemId);
            next.add(newId);
            try {
              localStorage.setItem(
                SELECTED_CART_STORAGE_KEY,
                JSON.stringify(Array.from(next))
              );
            } catch {
              // Ignore
            }
            return next;
          });
        }

        if (existingIdentical) {
          // Merge this item into existing item and remove current itemId
          const mergedQty = existingIdentical.quantity + targetQty;
          return prev
            .filter((i) => i.id !== itemId)
            .map((i) =>
              i.id === newId
                ? {
                    ...i,
                    itemNote: resolvedNote,
                    quantity: mergedQty,
                    itemTotal: unitPrice * mergedQty,
                    productType: itemToEdit.productType || "preorder",
                  }
                : i
            );
        } else {
          // Update item in place
          return prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  id: newId,
                  selectedOptions: normalizedOptions,
                  selectedAddons: newAddons,
                  itemNote: resolvedNote,
                  quantity: targetQty,
                  unitPrice,
                  itemTotal: unitPrice * targetQty,
                  productType: itemToEdit.productType || "preorder",
                }
              : i
          );
        }
      });
    },
    [createItemCompositeKey]
  );

  const clearCart = React.useCallback(() => {
    setCart([]);
    setSelectedCartItemIds(new Set());
    setOrderNoteState("");
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(ORDER_NOTE_KEY);
      localStorage.removeItem(SELECTED_CART_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const setBuyNowItem = React.useCallback((item: CartItem | null) => {
    const normalizedItem = item
      ? {
          ...item,
          productType: normalizeProductType(item.productType),
        }
      : null;
    setBuyNowItemState(normalizedItem);
    try {
      if (normalizedItem) {
        sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(normalizedItem));
      } else {
        sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }, []);

  const clearBuyNowItem = React.useCallback(() => {
    setBuyNowItemState(null);
    try {
      sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const toggleCartItemSelection = React.useCallback((itemId: string) => {
    setSelectedCartItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      try {
        localStorage.setItem(
          SELECTED_CART_STORAGE_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const toggleSelectAllCartItems = React.useCallback(() => {
    setSelectedCartItemIds((prev) => {
      const isAllSelected = cart.length > 0 && cart.every((item) => prev.has(item.id));
      const next = isAllSelected ? new Set<string>() : new Set<string>(cart.map((item) => item.id));
      try {
        localStorage.setItem(
          SELECTED_CART_STORAGE_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Ignore
      }
      return next;
    });
  }, [cart]);

  const cartProductType = React.useMemo(
    () => getCartProductType(cart),
    [cart]
  );

  const subtotal = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.itemTotal, 0),
    [cart]
  );
  const itemCount = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );
  const hasSoldOutItem = React.useMemo(
    () => cart.some((item) => !item.isAvailable),
    [cart]
  );

  const selectedCartItems = React.useMemo(
    () => cart.filter((item) => selectedCartItemIds.has(item.id)),
    [cart, selectedCartItemIds]
  );

  const selectedSubtotal = React.useMemo(
    () => selectedCartItems.reduce((sum, item) => sum + item.itemTotal, 0),
    [selectedCartItems]
  );

  const hasSoldOutSelected = React.useMemo(
    () => selectedCartItems.some((item) => !item.isAvailable),
    [selectedCartItems]
  );

  const contextValue = React.useMemo(
    () => ({
      cart,
      cartProductType,
      isHydrated,
      addToCart,
      updateQuantity,
      updateItemNote,
      removeFromCart,
      clearCart,
      subtotal,
      itemCount,
      hasSoldOutItem,
      orderNote,
      setOrderNote,
      favorites,
      toggleFavorite,
      isFavorite,
      cartSuccessEvent,
      dismissCartSuccess,
      quickAddProduct,
      openQuickAdd,
      closeQuickAdd,
      updateCartItemOptions,
      buyNowItem,
      setBuyNowItem,
      clearBuyNowItem,
      selectedCartItemIds,
      selectedCartItems,
      selectedSubtotal,
      hasSoldOutSelected,
      toggleCartItemSelection,
      toggleSelectAllCartItems,
      setSelectedCartItemIds,
    }),
    [
      cart,
      cartProductType,
      isHydrated,
      addToCart,
      updateQuantity,
      updateItemNote,
      removeFromCart,
      clearCart,
      subtotal,
      itemCount,
      hasSoldOutItem,
      orderNote,
      setOrderNote,
      favorites,
      toggleFavorite,
      isFavorite,
      cartSuccessEvent,
      dismissCartSuccess,
      quickAddProduct,
      openQuickAdd,
      closeQuickAdd,
      updateCartItemOptions,
      buyNowItem,
      setBuyNowItem,
      clearBuyNowItem,
      selectedCartItemIds,
      selectedCartItems,
      selectedSubtotal,
      hasSoldOutSelected,
      toggleCartItemSelection,
      toggleSelectAllCartItems,
      setSelectedCartItemIds,
    ]
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
      <QuickAddModal
        product={quickAddProduct}
        isOpen={Boolean(quickAddProduct)}
        onClose={closeQuickAdd}
      />
      <CartSuccessOverlay />

      {/* Confirmation Dialog: Replace Cart upon Different Product Type */}
      {pendingConflict && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-conflict-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#F25B09] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setPendingConflict(null)}
                aria-label="Tutup dialog"
                className="p-1 rounded-lg hover:bg-neutral-100 text-[#737373] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 id="cart-conflict-title" className="text-sm font-bold text-[#111111]">
                Ganti Jenis Pesanan?
              </h3>
              <p className="text-xs text-[#737373] leading-relaxed">
                Keranjang kamu berisi produk{" "}
                <strong className="text-[#111111]">
                  {pendingConflict.currentType === "ready" ? "READY" : "PRE-ORDER"}
                </strong>
                . Untuk menambahkan produk{" "}
                <strong className="text-[#111111]">
                  {pendingConflict.incomingType === "ready" ? "READY" : "PRE-ORDER"}
                </strong>
                , keranjang saat ini harus diganti. Lanjutkan?
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingConflict(null)}
                className="flex-1 min-h-[40px] px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-[#111111] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const conflict = pendingConflict;
                  setPendingConflict(null);
                  executeAddToCart(
                    conflict.product,
                    conflict.options,
                    conflict.addons,
                    conflict.itemNote,
                    conflict.quantity,
                    true
                  );
                }}
                className="flex-1 min-h-[40px] px-4 py-2 bg-[#F25B09] hover:bg-[#D94D06] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Ganti Keranjang
              </button>
            </div>
          </div>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCartSafe() {
  return useContext(CartContext);
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
