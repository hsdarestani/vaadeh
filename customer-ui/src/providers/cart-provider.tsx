'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface CartLine {
  menuVariantId: string;
  name: string;
  price: number;
  qty: number;
}

interface CartContextValue {
  items: CartLine[];
  addItem: (item: Omit<CartLine, 'qty'>, qty?: number) => void;
  updateQty: (menuVariantId: string, qty: number) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = 'vaadeh_cart_v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setItems(JSON.parse(cached));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartLine, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.menuVariantId === item.menuVariantId);
      if (existing) {
        return prev.map((p) =>
          p.menuVariantId === item.menuVariantId ? { ...p, qty: p.qty + qty } : p
        );
      }
      return [...prev, { ...item, qty }];
    });
  };

  const updateQty = (menuVariantId: string, qty: number) => {
    setItems((prev) => prev.map((p) => (p.menuVariantId === menuVariantId ? { ...p, qty } : p)));
  };

  const clear = () => setItems([]);

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, clear, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
