'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000/api';

const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'VENDOR_ACCEPTED',
  'VENDOR_REJECTED',
  'PREPARING',
  'READY',
  'COURIER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED'
];

export type Order = {
  id: string;
  status: string;
  totalPrice: string;
  deliveryFee: string;
  paymentStatus: string;
  vendor?: { id: string; name: string };
  user?: { id: string; mobile: string };
  createdAt: string;
};

export type Vendor = {
  id: string;
  name: string;
  isActive: boolean;
  serviceRadiusKm: number;
  telegramChatId?: string | null;
};

export type KPI = {
  dailyOrders: number;
  totalSales: number;
  cancelRate: number;
  paymentConversion: number;
  acceptanceRate: number;
  averageSecondsToAccept: number;
  averageSecondsToComplete: number;
  deliveryMix: { inRange: number; outOfRange: number; outOfZonePercent: number };
  ordersPerDay: Record<string, number>;
};

export type Payment = {
  id: string;
  orderId: string;
  amount: string;
  status: string;
  createdAt: string;
  provider: string;
};

export type NotificationLog = {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  createdAt: string;
  eventName?: string | null;
  lastError?: string | null;
};

export type AdminUser = {
  id: string;
  mobile: string;
  isBlocked: boolean;
  isActive: boolean;
  orders: Order[];
};

export type EventLog = {
  id: string;
  createdAt: string;
  eventName: string;
  actorType?: string | null;
  actorId?: string | null;
  metadata: Record<string, unknown>;
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

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<KPI | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, any>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('');
  const [orderVendorFilter, setOrderVendorFilter] = useState<string>('');
  const [vendorDraft, setVendorDraft] = useState({
    name: '',
    lat: '',
    lng: '',
    serviceRadiusKm: '',
    telegramChatId: ''
  });

  const loggedIn = useMemo(() => Boolean(token), [token]);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    try {
      const [ordersResp, vendorsResp, kpiResp, paymentResp, notifResp, eventsResp, usersResp] = await Promise.all([
        apiFetch<Order[]>('/admin/orders', token),
        apiFetch<Vendor[]>('/admin/vendors', token),
        apiFetch<KPI>('/admin/kpis', token),
        apiFetch<Payment[]>('/admin/payments', token),
        apiFetch<NotificationLog[]>('/admin/notifications', token),
        apiFetch<EventLog[]>('/admin/events', token),
        apiFetch<AdminUser[]>('/admin/users', token)
      ]);
      setOrders(ordersResp);
      setVendors(vendorsResp);
      setKpis(kpiResp);
      setPayments(paymentResp);
      setNotifications(notifResp);
      setEvents(eventsResp);
      setUsers(usersResp);
    } catch (err: any) {
      setMessage(err.message ?? 'Load failed');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll, token]);

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
    const draft = orderDrafts[orderId] ?? {};
    await apiFetch(`/admin/orders/${orderId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        status: draft.status,
        statusNote: draft.statusNote,
        deliveryFee: draft.deliveryFee ? Number(draft.deliveryFee) : undefined,
        deliveryFeeFinal: draft.deliveryFeeFinal ? Number(draft.deliveryFeeFinal) : undefined,
        courierReference: draft.courierReference,
        adminNote: draft.adminNote
      })
    });
    await refreshAll();
    setMessage('Order updated');
  };

  const createVendor = async () => {
    if (!token) return;
    await apiFetch('/admin/vendors', token, {
      method: 'POST',
      body: JSON.stringify({
        name: vendorDraft.name,
        lat: Number(vendorDraft.lat),
        lng: Number(vendorDraft.lng),
        serviceRadiusKm: Number(vendorDraft.serviceRadiusKm),
        telegramChatId: vendorDraft.telegramChatId || undefined
      })
    });
    setVendorDraft({ name: '', lat: '', lng: '', serviceRadiusKm: '', telegramChatId: '' });
    await refreshAll();
    setMessage('Vendor created');
  };

  const updateUserFlags = async (userId: string, flags: { isBlocked?: boolean; isActive?: boolean }) => {
    if (!token) return;
    await apiFetch(`/admin/users/${userId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(flags)
    });
    await refreshAll();
  };

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = orderStatusFilter ? order.status === orderStatusFilter : true;
    const matchesVendor = orderVendorFilter ? order.vendor?.id === orderVendorFilter : true;
    return matchesStatus && matchesVendor;
  });

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
        <div className="flex gap-3 items-center">
          <button className="button" onClick={refreshAll}>
            بروزرسانی دستی
          </button>
          <button className="button" onClick={clear}>
            خروج
          </button>
        </div>
      </div>

      {message && <div className="card text-amber-700">{message}</div>}

      {kpis && (
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            <p className="text-sm text-slate-500">نرخ پذیرش</p>
            <p className="text-2xl font-bold">{(kpis.acceptanceRate * 100).toFixed(1)}%</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">زمان تا پذیرش</p>
            <p className="text-2xl font-bold">{kpis.averageSecondsToAccept.toFixed(0)} ثانیه</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">زمان تا تکمیل</p>
            <p className="text-2xl font-bold">{kpis.averageSecondsToComplete.toFixed(0)} ثانیه</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">خارج از محدوده</p>
            <p className="text-2xl font-bold">{(kpis.deliveryMix.outOfZonePercent * 100).toFixed(1)}%</p>
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">۷ روز اخیر</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-700">
            {Object.entries(kpis.ordersPerDay)
              .sort(([a], [b]) => (a > b ? 1 : -1))
              .map(([day, count]) => (
                <span key={day} className="px-2 py-1 rounded bg-slate-100">
                  {day}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">سفارش‌ها</h2>
          <span className="text-sm text-slate-500">به‌روزرسانی خودکار ۱۵ ثانیه‌ای</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            className="border rounded px-2 py-1"
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1"
            value={orderVendorFilter}
            onChange={(e) => setOrderVendorFilter(e.target.value)}
          >
            <option value="">همه وندورها</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">{filteredOrders.length} نتایج</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-2 pr-4">سفارش</th>
                <th className="py-2 pr-4">مشتری</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">مبلغ</th>
                <th className="py-2 pr-4">پرداخت</th>
                <th className="py-2 pr-4">وضعیت</th>
                <th className="py-2 pr-4">تغییر</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="py-2 pr-4">{order.id.slice(0, 8)}</td>
                  <td className="py-2 pr-4">{order.user?.mobile}</td>
                  <td className="py-2 pr-4">{order.vendor?.name}</td>
                  <td className="py-2 pr-4">
                    {(Number(order.totalPrice) + Number(order.deliveryFee)).toLocaleString()} تومان
                  </td>
                  <td className="py-2 pr-4">{order.paymentStatus}</td>
                  <td className="py-2 pr-4 font-semibold">{order.status}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded px-2 py-1"
                        value={orderDrafts[order.id]?.status ?? order.status}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], status: e.target.value }
                          }))
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <input
                        className="border rounded px-2 py-1"
                        placeholder="یادداشت وضعیت"
                        value={orderDrafts[order.id]?.statusNote ?? ''}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], statusNote: e.target.value }
                          }))
                        }
                      />
                      <input
                        className="border rounded px-2 py-1"
                        placeholder="هزینه ارسال"
                        value={orderDrafts[order.id]?.deliveryFee ?? ''}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], deliveryFee: e.target.value }
                          }))
                        }
                      />
                      <input
                        className="border rounded px-2 py-1"
                        placeholder="هزینه نهایی"
                        value={orderDrafts[order.id]?.deliveryFeeFinal ?? ''}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], deliveryFeeFinal: e.target.value }
                          }))
                        }
                      />
                      <input
                        className="border rounded px-2 py-1"
                        placeholder="کد پیک"
                        value={orderDrafts[order.id]?.courierReference ?? ''}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], courierReference: e.target.value }
                          }))
                        }
                      />
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
          <span className="text-sm text-slate-500">افزودن سریع</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="border rounded p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{vendor.name}</p>
                  <p className="text-xs text-slate-500">شعاع سرویس: {vendor.serviceRadiusKm} km</p>
                  {vendor.telegramChatId && <p className="text-xs text-slate-500">TG: {vendor.telegramChatId}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded ${vendor.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {vendor.isActive ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 grid md:grid-cols-5 gap-2">
          <input
            className="border rounded px-2 py-1"
            placeholder="نام"
            value={vendorDraft.name}
            onChange={(e) => setVendorDraft((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Lat"
            value={vendorDraft.lat}
            onChange={(e) => setVendorDraft((prev) => ({ ...prev, lat: e.target.value }))}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Lng"
            value={vendorDraft.lng}
            onChange={(e) => setVendorDraft((prev) => ({ ...prev, lng: e.target.value }))}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="شعاع خدمت"
            value={vendorDraft.serviceRadiusKm}
            onChange={(e) => setVendorDraft((prev) => ({ ...prev, serviceRadiusKm: e.target.value }))}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Telegram Chat ID"
            value={vendorDraft.telegramChatId}
            onChange={(e) => setVendorDraft((prev) => ({ ...prev, telegramChatId: e.target.value }))}
          />
          <button className="button col-span-full md:col-span-1" onClick={createVendor} disabled={!vendorDraft.name}>
            ایجاد وندور
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">کاربران</h2>
          <span className="text-sm text-slate-500">بلوک / فعال‌سازی</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {users.map((user) => (
            <div key={user.id} className="border rounded p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{user.mobile}</p>
                  <p className="text-xs text-slate-500">{user.id.slice(0, 8)}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className={`px-2 py-1 rounded ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {user.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                  {user.isBlocked && <span className="px-2 py-1 rounded bg-red-100 text-red-700">مسدود</span>}
                </div>
              </div>
              <div className="flex gap-2 text-xs text-slate-600 flex-wrap">
                {user.orders.slice(0, 2).map((order) => (
                  <span key={order.id} className="px-2 py-1 rounded bg-slate-100">
                    سفارش {order.status}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="button" onClick={() => updateUserFlags(user.id, { isBlocked: !user.isBlocked })}>
                  {user.isBlocked ? 'رفع مسدودی' : 'مسدود کردن'}
                </button>
                <button className="button" onClick={() => updateUserFlags(user.id, { isActive: !user.isActive })}>
                  {user.isActive ? 'غیرفعال' : 'فعال‌سازی'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">پرداخت‌ها</h2>
            <span className="text-sm text-slate-500">آخرین ۵۰ پرداخت</span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-1 pr-4">{p.id.slice(0, 8)}</td>
                    <td className="py-1 pr-4">{p.orderId.slice(0, 8)}</td>
                    <td className="py-1 pr-4">{p.provider}</td>
                    <td className="py-1 pr-4">{Number(p.amount).toLocaleString()}</td>
                    <td className="py-1 pr-4">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">اعلان‌ها</h2>
            <span className="text-sm text-slate-500">Telegram/SMS</span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Recipient</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id} className="border-t">
                    <td className="py-1 pr-4">{n.channel}</td>
                    <td className="py-1 pr-4">{n.recipient}</td>
                    <td className="py-1 pr-4">{n.eventName ?? '-'}</td>
                    <td className="py-1 pr-4">{n.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">رویدادها</h2>
          <span className="text-sm text-slate-500">آخرین ۱۰۰ رخداد محصولی/سیستمی</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">جزئیات</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-1 pr-4">{e.eventName}</td>
                  <td className="py-1 pr-4">{e.actorType ?? '-'}</td>
                  <td className="py-1 pr-4 text-xs text-slate-600 max-w-lg truncate">
                    {JSON.stringify(e.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
