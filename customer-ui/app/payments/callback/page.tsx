'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { verifyPayment } from '@/src/lib/api-client';
import { Protected } from '@/src/components/protected';

export default function PaymentCallbackPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('در حال بررسی پرداخت...');

  useEffect(() => {
    const trackId = search.get('trackId');
    const orderId = search.get('orderId') || undefined;
    if (!trackId) return;

    const verify = async () => {
      try {
        await verifyPayment(trackId, orderId);
        setMessage('پرداخت تایید شد. در حال انتقال به سفارش...');
        if (orderId) {
          router.replace(`/orders/${orderId}`);
        }
      } catch (err: any) {
        setMessage(err.message || 'تایید پرداخت ناموفق بود');
      }
    };

    void verify();
  }, [router, search]);

  return (
    <Protected>
      <div className="card p-8 text-center space-y-2">
        <p className="text-lg font-semibold text-white">نتیجه پرداخت</p>
        <p className="text-slate-300">{message}</p>
      </div>
    </Protected>
  );
}
