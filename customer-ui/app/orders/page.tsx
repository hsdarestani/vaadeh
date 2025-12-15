'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Protected } from '@/src/components/protected';
import { OrderSummary, listOrders } from '@/src/lib/api-client';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await listOrders();
      setOrders(data);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <Protected>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-300">پیگیری سفارش‌ها</p>
          <h1 className="text-2xl font-semibold text-white">آخرین سفارش‌ها</h1>
        </div>
        {loading && <div className="spinner" />}
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div>
                <p className="font-semibold text-white">کد سفارش: {order.id.slice(0, 8)}</p>
                <p className="text-sm text-slate-300">{new Date(order.createdAt).toLocaleString('fa-IR')}</p>
              </div>
              <div className="text-right">
                <p className="badge">وضعیت: {order.status}</p>
                <p className="text-sm text-slate-300">مبلغ: {Number(order.totalPrice).toLocaleString()} تومان</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Protected>
  );
}
