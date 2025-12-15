'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Protected } from '@/src/components/protected';
import { getOrder } from '@/src/lib/api-client';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await getOrder(params.id);
      setOrder(data);
      setLoading(false);
    };
    void load();
  }, [params.id]);

  return (
    <Protected>
      <div className="card p-6 space-y-4">
        {loading && <div className="spinner" />}
        {order && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-white">سفارش {order.id.slice(0, 8)}</h1>
              <span className="badge">{order.status}</span>
            </div>
            <p className="text-sm text-slate-300">مبلغ: {Number(order.totalPrice).toLocaleString()} تومان</p>
            <p className="text-sm text-slate-300">پرداخت: {order.paymentStatus}</p>
            <p className="text-sm text-slate-300">
              ارسال: {order.deliveryProvider || order.deliveryType}{' '}
              {order.outOfZone ? '(خارج از محدوده)' : ''} {order.isCOD ? '(پس‌کرایه)' : ''}
            </p>
            {order.deliverySettlementType === 'COD' && (
              <p className="text-xs text-amber-200">هزینه پیک هنگام تحویل پرداخت می‌شود.</p>
            )}
            {order.deliveryFeeEstimate && (
              <p className="text-sm text-slate-300">
                برآورد هزینه پیک: {Number(order.deliveryFeeEstimate).toLocaleString()} تومان
              </p>
            )}
            <div className="space-y-2">
              <h2 className="font-semibold text-white">آیتم‌ها</h2>
              {order.items?.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-900/60 p-3">
                  <span className="text-slate-200">{item.menuVariantId}</span>
                  <span className="text-slate-200">x{item.qty}</span>
                  <span className="text-slate-200">{Number(item.unitPrice).toLocaleString()} تومان</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Protected>
  );
}
