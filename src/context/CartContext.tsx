"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { CartItem, Product, SelectedOption, SelectedAddon } from "@/types";
import { PRODUCTS } from "@/data/dummy-data";
import { CartSuccessOverlay } from "@/components/cart/CartSuccessOverlay";
import { QuickAddModal } from "@/components/product/QuickAddModal";

interface CartContextType {
  cart: CartItem[];
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
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "temu_cart_items_v1";
const ORDER_NOTE_KEY = "temu_order_note_v1";
const FAVORITES_KEY = "temu_favorites_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Initialize with hydration-safe defaults so SSR and initial client render produce identical markup
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState<string>("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = React.useRef(false);

  // Restore persisted browser state after mounting
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (storedCart) {
          const parsed: CartItem[] = JSON.parse(storedCart);
          setCart(
            parsed.map((item) => {
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
              };
            })
          );
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

  const addToCart = React.useCallback(
    (
      product: Product,
      options: SelectedOption[],
      addons: SelectedAddon[],
      itemNote: string,
      quantity: number
    ) => {
      if (quantity <= 0 || !product.isAvailable) return;

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

      setCart((prev) => {
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
          };
          return updated;
        } else {
          // Add as separate line item at index 0 (newest items appear first)
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
          };
          return [newItem, ...prev];
        }
      });

      // Trigger cart success Lottie animation
      setCartSuccessEvent({ id: Date.now() });
    },
    [createItemCompositeKey]
  );

  const updateQuantity = React.useCallback(
    (itemId: string, newQuantity: number) => {
      if (newQuantity <= 0) {
        setCart((prev) => prev.filter((item) => item.id !== itemId));
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
  }, []);

  const clearCart = React.useCallback(() => {
    setCart([]);
    setOrderNoteState("");
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(ORDER_NOTE_KEY);
    } catch {
      // Ignore
    }
  }, []);

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

  const contextValue = React.useMemo(
    () => ({
      cart,
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
    }),
    [
      cart,
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
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
