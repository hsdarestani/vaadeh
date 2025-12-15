'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/src/components/protected';
import { Address, createAddress, deleteAddress, listAddresses, setDefaultAddress } from '@/src/lib/api-client';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', fullAddress: '', lat: '', lng: '' });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await listAddresses();
      setAddresses(data);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت آدرس‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    setError('');
    try {
      await createAddress({
        title: form.title,
        fullAddress: form.fullAddress,
        lat: Number(form.lat),
        lng: Number(form.lng)
      });
      setForm({ title: '', fullAddress: '', lat: '', lng: '' });
      await load();
    } catch (err: any) {
      setError(err.message || 'ثبت آدرس ناموفق بود');
    }
  };

  return (
    <Protected>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">آدرس‌های من</h2>
            <p className="text-sm text-slate-300">آدرس پیش‌فرض برای ثبت سفارش استفاده می‌شود.</p>
          </div>
          {loading ? (
            <div className="spinner" />
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <div key={a.id} className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-white">{a.title}</p>
                    <p className="text-sm text-slate-300">{a.fullAddress}</p>
                    <p className="text-xs text-slate-400">
                      {a.lat}, {a.lng}
                    </p>
                    {a.isDefault && <span className="badge">پیش‌فرض</span>}
                  </div>
                  <div className="flex flex-col gap-2">
                    {!a.isDefault && (
                      <button className="btn-secondary text-xs" onClick={() => setDefaultAddress(a.id).then(load)}>
                        انتخاب پیش‌فرض
                      </button>
                    )}
                    <button className="text-xs text-rose-400" onClick={() => deleteAddress(a.id).then(load)}>
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">افزودن آدرس جدید</h2>
          <div className="grid gap-3">
            <input
              className="input"
              placeholder="عنوان (خانه، دفتر)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              className="input"
              placeholder="نشانی کامل"
              value={form.fullAddress}
              onChange={(e) => setForm((f) => ({ ...f, fullAddress: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input"
                placeholder="Latitude"
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Longitude"
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn-primary w-full" onClick={submit} disabled={loading}>
            ذخیره آدرس
          </button>
        </div>
      </div>
    </Protected>
  );
}
