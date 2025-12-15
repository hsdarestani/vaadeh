'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Protected } from '@/src/components/protected';
import { Address, createOrder, listAddresses, requestPayment } from '@/src/lib/api-client';
import { useCart } from '@/src/providers/cart-provider';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, updateQty, total, clear } = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [payAtDelivery, setPayAtDelivery] = useState(false);
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const data = await listAddresses();
      setAddresses(data);
      const def = data.find((a) => a.isDefault) ?? data[0];
      setAddressId(def?.id || '');
    };
    void load();
  }, []);

  const placeOrder = async () => {
    setLoading(true);
    setError('');
    try {
      if (payAtDelivery && !codConfirmed) {
        throw new Error('برای پرداخت در مقصد باید پس‌کرایه اسنپ را تایید کنید.');
      }
      const order = await createOrder({
        addressId,
        items: items.map((i) => ({ menuVariantId: i.menuVariantId, qty: i.qty })),
        customerNote: note,
        payAtDelivery
      });
      clear();
      if (!payAtDelivery && !order.isCOD) {
        const payment = await requestPayment(order.id);
        if (payment.payLink) {
          window.location.href = payment.payLink;
          return;
        }
      }
      router.replace(`/orders/${order.id}`);
    } catch (err: any) {
      setError(err.message || 'ثبت سفارش ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Protected>
      <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">بررسی سبد</p>
              <h1 className="text-xl font-semibold text-white">Checkout</h1>
            </div>
          </div>

          {!items.length && <p className="text-slate-300">سبد شما خالی است.</p>}

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.menuVariantId} className="flex items-center justify-between rounded-lg bg-slate-900/60 p-3">
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-sm text-slate-400">{Number(item.price).toLocaleString()} تومان</p>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input w-20"
                  value={item.qty}
                  onChange={(e) => updateQty(item.menuVariantId, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="text-white font-semibold">آدرس ارسال</h2>
            <select
              className="input"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} - {a.fullAddress}
                </option>
              ))}
            </select>
            <textarea
              className="input h-24"
              placeholder="توضیحات برای سفارش"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={payAtDelivery}
                onChange={(e) => {
                  setPayAtDelivery(e.target.checked);
                  setCodConfirmed(false);
                }}
              />
              ارسال با پیک اسنپ / پرداخت در مقصد (خارج از محدوده یا پس‌کرایه)
            </label>
            {payAtDelivery && (
              <label className="flex items-center gap-2 text-xs text-amber-200 bg-amber-900/20 p-3 rounded">
                <input
                  type="checkbox"
                  checked={codConfirmed}
                  onChange={(e) => setCodConfirmed(e.target.checked)}
                />
                تایید می‌کنم هزینه ارسال با پیک اسنپ به صورت پس‌کرایه توسط من پرداخت می‌شود.
              </label>
            )}
            {!payAtDelivery && (
              <p className="text-xs text-slate-400">
                خارج از محدوده‌ها به صورت پیش‌فرض با پیک اسنپ و پس‌کرایه ارسال می‌شود؛ در صورت انتخاب پرداخت
                آنلاین، هزینه ارسال جداگانه هنگام تحویل از شما گرفته خواهد شد.
              </p>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between text-slate-200">
              <span>مجموع</span>
              <span>{total.toLocaleString()} تومان</span>
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              className="btn-primary w-full"
              disabled={!items.length || loading || (payAtDelivery && !codConfirmed)}
              onClick={placeOrder}
            >
              {loading ? '...' : 'ثبت سفارش'}
            </button>
          </div>
        </div>
      </div>
    </Protected>
  );
}
