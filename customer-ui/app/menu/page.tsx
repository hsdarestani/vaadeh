'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/src/components/protected';
import { VendorMenu, getMenu } from '@/src/lib/api-client';
import { useCart } from '@/src/providers/cart-provider';

export default function MenuPage() {
  const [vendors, setVendors] = useState<VendorMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addItem, items } = useCart();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getMenu();
        setVendors(data);
      } catch (err: any) {
        setError(err.message || 'دریافت منو ناموفق بود');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <Protected>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-300">منوی آنلاین</p>
            <h1 className="text-2xl font-bold text-white">انتخاب و افزودن به سبد</h1>
          </div>
          <Link href="/checkout" className="btn-secondary">
            سبد ({items.length})
          </Link>
        </div>

        {loading && <div className="spinner" />}
        {error && <p className="text-rose-400">{error}</p>}

        <div className="grid gap-4">
          {vendors.map((vendor, idx) => (
            <motion.div
              key={vendor.id}
              className="card p-6 space-y-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.05 } }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{vendor.name}</h2>
                  <p className="text-sm text-slate-400">شعاع سرویس: {vendor.serviceRadiusKm}km</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {vendor.menuItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{item.name}</p>
                      <span className="badge">{item.variants.length} سایز</span>
                    </div>
                    <div className="space-y-2">
                      {item.variants.map((variant) => (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm text-slate-200">{variant.code}</p>
                            <p className="text-xs text-slate-400">{Number(variant.price).toLocaleString()} تومان</p>
                          </div>
                          <button
                            className="btn-primary text-xs"
                            onClick={() =>
                              addItem({
                                menuVariantId: variant.id,
                                name: `${item.name} - ${variant.code}`,
                                price: Number(variant.price)
                              })
                            }
                          >
                            افزودن
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Protected>
  );
}
