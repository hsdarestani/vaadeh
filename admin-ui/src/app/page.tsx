'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000/api';

type Order = {
  id: string;
  status: string;
  totalPrice: string;
  deliveryFee: string;
  vendor?: { id: string; name: string };
  user?: { mobile: string };
  createdAt: string;
};

type Vendor = {
  id: string;
  name: string;
  isActive: boolean;
  serviceRadiusKm: number;
};

type KPI = {
  dailyOrders: number;
  totalSales: number;
  cancelRate: number;
  paymentConversion: number;
  averageSecondsToAccept: number;
  averageSecondsToComplete: number;
  deliveryMix: { inRange: number; outOfRange: number };
};

function useToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(localStorage.getItem('vaadeh_admin_token'));
  }, []);

  const save = (next: string) => {
    localStorage.setItem('vaadeh_admin_token', next);
    setToken(next);
  };

  const clear = () => {
    localStorage.removeItem('vaadeh_admin_token');
    setToken(null);
  };

  return { token, save, clear };
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Dashboard() {
  const { token, save, clear } = useToken();
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<KPI | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const loggedIn = useMemo(() => Boolean(token), [token]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const [ordersResp, vendorsResp, kpiResp] = await Promise.all([
          apiFetch('/admin/orders', token),
          apiFetch('/admin/vendors', token),
          apiFetch('/admin/kpis', token)
        ]);
        setOrders(ordersResp);
        setVendors(vendorsResp);
        setKpis(kpiResp);
      } catch (err: any) {
        setMessage(err.message ?? 'Load failed');
      }
    };
    load();
  }, [token]);

  const requestOtp = async () => {
    setMessage(null);
    await fetch(`${API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    setMessage('OTP sent');
  };

  const verifyOtp = async () => {
    setMessage(null);
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code: otp })
    });
    if (!res.ok) {
      setMessage('Login failed');
      return;
    }
    const data = await res.json();
    save(data.accessToken);
  };

  const updateOrder = async (orderId: string) => {
    if (!token) return;
    const nextStatus = statusDrafts[orderId];
    await apiFetch(`/admin/orders/${orderId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    const refreshed = await apiFetch('/admin/orders', token);
    setOrders(refreshed);
    setMessage('Order updated');
  };

  if (!loggedIn) {
    return (
      <main className="max-w-md mx-auto">
        <div className="card space-y-4">
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <label className="block text-sm font-semibold text-slate-700">Mobile</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="09xxxxxxxxx"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
          <button className="button w-full" onClick={requestOtp} disabled={!mobile}>
            درخواست OTP
          </button>
          <label className="block text-sm font-semibold text-slate-700">OTP</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <button className="button w-full" onClick={verifyOtp} disabled={!mobile || !otp}>
            ورود
          </button>
          {message && <p className="text-sm text-amber-700">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">داشبورد ادمین</h1>
          <p className="text-slate-600">کنترل سفارش‌ها، منو و وندورها</p>
        </div>
        <button className="button" onClick={clear}>
          خروج
        </button>
      </div>

      {message && <div className="card text-amber-700">{message}</div>}

      {kpis && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="card">
            <p className="text-sm text-slate-500">سفارش امروز</p>
            <p className="text-2xl font-bold">{kpis.dailyOrders}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">فروش کل</p>
            <p className="text-2xl font-bold">{kpis.totalSales.toLocaleString()} تومان</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">نرخ لغو</p>
            <p className="text-2xl font-bold">{(kpis.cancelRate * 100).toFixed(1)}%</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">کُنورژن پرداخت</p>
            <p className="text-2xl font-bold">{(kpis.paymentConversion * 100).toFixed(1)}%</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">زمان تا پذیرش</p>
            <p className="text-2xl font-bold">{kpis.averageSecondsToAccept.toFixed(0)} ثانیه</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">زمان تا تکمیل</p>
            <p className="text-2xl font-bold">{kpis.averageSecondsToComplete.toFixed(0)} ثانیه</p>
          </div>
        </div>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">سفارش‌ها</h2>
          <span className="text-sm text-slate-500">آخرین ۵۰ سفارش</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-2 pr-4">سفارش</th>
                <th className="py-2 pr-4">مشتری</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">مبلغ</th>
                <th className="py-2 pr-4">وضعیت</th>
                <th className="py-2 pr-4">تغییر</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="py-2 pr-4">{order.id.slice(0, 8)}</td>
                  <td className="py-2 pr-4">{order.user?.mobile}</td>
                  <td className="py-2 pr-4">{order.vendor?.name}</td>
                  <td className="py-2 pr-4">
                    {(Number(order.totalPrice) + Number(order.deliveryFee)).toLocaleString()} تومان
                  </td>
                  <td className="py-2 pr-4 font-semibold">{order.status}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded px-2 py-1"
                        value={statusDrafts[order.id] ?? order.status}
                        onChange={(e) =>
                          setStatusDrafts((prev) => ({
                            ...prev,
                            [order.id]: e.target.value
                          }))
                        }
                      >
                        {['PENDING', 'ACCEPTED', 'DELIVERY_INTERNAL', 'DELIVERY_SNAPP', 'COMPLETED', 'CANCELLED', 'REJECTED'].map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <button className="button" onClick={() => updateOrder(order.id)}>
                        ذخیره
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">وندورها</h2>
          <span className="text-sm text-slate-500">فعال / ظرفیت</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="border rounded p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{vendor.name}</p>
                  <p className="text-xs text-slate-500">شعاع سرویس: {vendor.serviceRadiusKm} km</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${vendor.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {vendor.isActive ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
