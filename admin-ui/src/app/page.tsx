'use client';

import { useCallback, useEffect, useState } from 'react';

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

const COURIER_STATUSES = ['PENDING', 'REQUESTED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED'];

export type Order = {
  id: string;
  status: string;
  totalPrice: string;
  deliveryFee: string;
  deliveryFeeEstimate?: string | null;
  paymentStatus: string;
  deliveryType?: string;
  deliveryProvider?: string;
  deliverySettlementType?: string | null;
  outOfZone?: boolean;
  isCOD?: boolean;
  courierStatus?: string;
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

type StageDurations = {
  placedToAccepted: number;
  acceptedToReady: number;
  readyToDelivered: number;
  placedToDelivered: number;
};

type DailyKpi = {
  date: string;
  orders: number;
  gmv: number;
  cancelRate: number;
  averageSeconds: StageDurations;
};

type VendorPerformance = {
  vendorId: string;
  vendorName?: string;
  orders: number;
  sales: number;
  rejected: number;
  rejectionRate: number;
  averageSeconds: StageDurations;
};

export type KPI = {
  dailyOrders: number;
  ordersThisWeek: number;
  totalSales: number;
  cancelRate: number;
  paymentConversion: number;
  paymentSuccessRate: number;
  acceptanceRate: number;
  averageSecondsToAccept: number;
  averageSecondsToComplete: number;
  averageFulfillmentSeconds: number;
  codRatio: number;
  deliveryMix: { inRange: number; outOfRange: number; outOfZonePercent: number };
  ordersPerDay: Record<string, number>;
  stageDurations: StageDurations;
  dailyKpis: DailyKpi[];
  vendorPerformance: VendorPerformance[];
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

export type NotificationHealth = {
  counts: { channel: string; status: string; _count: { _all: number } }[];
  queue: {
    dispatcherCounts?: Record<string, number> | null;
    deadLetterCounts?: Record<string, number> | null;
  };
};

export type Funnel = {
  menuViews: number;
  checkout: number;
  payment: number;
  delivered: number;
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Dashboard() {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<KPI | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, any>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [notificationHealth, setNotificationHealth] = useState<NotificationHealth | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [eventFilters, setEventFilters] = useState({ eventName: '', orderId: '', userId: '', actorType: '', from: '', to: '' });
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('');
  const [orderVendorFilter, setOrderVendorFilter] = useState<string>('');
  const [vendorDraft, setVendorDraft] = useState({
    name: '',
    lat: '',
    lng: '',
    serviceRadiusKm: '',
    telegramChatId: ''
  });

  const eventQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (eventFilters.eventName) params.set('eventName', eventFilters.eventName);
    if (eventFilters.orderId) params.set('orderId', eventFilters.orderId);
    if (eventFilters.userId) params.set('userId', eventFilters.userId);
    if (eventFilters.actorType) params.set('actorType', eventFilters.actorType);
    if (eventFilters.from) params.set('from', eventFilters.from);
    if (eventFilters.to) params.set('to', eventFilters.to);
    return params.toString();
  }, [eventFilters]);

  const fetchEvents = useCallback(async () => {
    const qs = eventQueryString();
    return apiFetch<EventLog[]>(`/admin/events${qs ? `?${qs}` : ''}`);
  }, [eventQueryString]);

  const refreshAll = useCallback(
    async (force = false) => {
      if (!force && !loggedIn) return;
      try {
        const [
          ordersResp,
          vendorsResp,
          kpiResp,
          paymentResp,
          notifResp,
          notifHealthResp,
          funnelResp,
          eventsResp,
          usersResp
        ] = await Promise.all([
          apiFetch<Order[]>('/admin/orders'),
          apiFetch<Vendor[]>('/admin/vendors'),
          apiFetch<KPI>('/admin/kpis'),
          apiFetch<Payment[]>('/admin/payments'),
          apiFetch<NotificationLog[]>('/admin/notifications'),
          apiFetch<NotificationHealth>('/admin/notifications/health'),
          apiFetch<Funnel>('/admin/funnel'),
          fetchEvents(),
          apiFetch<AdminUser[]>('/admin/users')
        ]);
        setOrders(ordersResp);
        setVendors(vendorsResp);
        setKpis(kpiResp);
        setPayments(paymentResp);
        setNotifications(notifResp);
        setNotificationHealth(notifHealthResp);
        setFunnel(funnelResp);
        setEvents(eventsResp);
        setUsers(usersResp);
        setLoggedIn(true);
      } catch (err: any) {
        setMessage(err.message ?? 'Load failed');
        if (!force) {
          setLoggedIn(false);
        }
      }
    },
    [loggedIn, fetchEvents]
  );

  useEffect(() => {
    (async () => {
      try {
        await refreshAll(true);
      } catch {
        setLoggedIn(false);
      } finally {
        setCheckingSession(false);
      }
    })();
    const interval = setInterval(() => refreshAll(), 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const requestOtp = async () => {
    setMessage(null);
    await fetch(`${API_BASE}/auth/admin/request-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    setMessage('OTP sent');
  };

  const verifyOtp = async () => {
    setMessage(null);
    const res = await fetch(`${API_BASE}/auth/admin/verify-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code: otp })
    });
    if (!res.ok) {
      setMessage('Login failed');
      return;
    }
    await res.json();
    setLoggedIn(true);
    void refreshAll(true);
  };

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    setLoggedIn(false);
    setOrders([]);
    setVendors([]);
    setUsers([]);
    setKpis(null);
    setPayments([]);
    setNotifications([]);
    setNotificationHealth(null);
    setFunnel(null);
    setEvents([]);
  };

  const applyEventFilters = async () => {
    const filtered = await fetchEvents();
    setEvents(filtered);
  };

  const exportEvents = () => {
    const qs = eventQueryString();
    const link = `${API_BASE}/admin/events${qs ? `?${qs}&` : '?'}format=csv`;
    window.open(link, '_blank');
  };

  const formatSeconds = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds)) return '—';
    if (seconds >= 90) return `${(seconds / 60).toFixed(1)} دقیقه`;
    return `${seconds.toFixed(0)} ثانیه`;
  };

  const updateOrder = async (orderId: string) => {
    const draft = orderDrafts[orderId] ?? {};
    await apiFetch(`/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: draft.status,
        statusNote: draft.statusNote,
        deliveryFee: draft.deliveryFee ? Number(draft.deliveryFee) : undefined,
        deliveryFeeFinal: draft.deliveryFeeFinal ? Number(draft.deliveryFeeFinal) : undefined,
        courierReference: draft.courierReference,
        adminNote: draft.adminNote,
        courierStatus: draft.courierStatus,
        deliveryProvider: draft.deliveryProvider,
        isCOD: draft.isCOD,
        deliverySettlementType: draft.deliverySettlementType
      })
    });
    await refreshAll();
    setMessage('Order updated');
  };

  const createVendor = async () => {
    await apiFetch('/admin/vendors', {
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
    await apiFetch(`/admin/users/${userId}`, {
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

  if (checkingSession) {
    return (
      <main className="max-w-md mx-auto">
        <div className="card space-y-2">
          <h1 className="text-xl font-semibold">در حال بررسی ورود...</h1>
          <p className="text-sm text-slate-600">لطفاً چند لحظه صبر کنید.</p>
        </div>
      </main>
    );
  }

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
          <button className="button" onClick={logout}>
            خروج
          </button>
        </div>
      </div>

      {message && <div className="card text-amber-700">{message}</div>}

      {kpis && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="card">
              <p className="text-sm text-slate-500">سفارش امروز</p>
              <p className="text-2xl font-bold">{kpis.dailyOrders}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">سفارش هفت روز اخیر</p>
              <p className="text-2xl font-bold">{kpis.ordersThisWeek}</p>
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
              <p className="text-sm text-slate-500">نرخ پذیرش</p>
              <p className="text-2xl font-bold">{(kpis.acceptanceRate * 100).toFixed(1)}%</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">نرخ پرداخت موفق</p>
              <p className="text-2xl font-bold">{(kpis.paymentSuccessRate * 100).toFixed(1)}%</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">زمان تا پذیرش</p>
              <p className="text-2xl font-bold">{kpis.averageSecondsToAccept.toFixed(0)} ثانیه</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">زمان تا تکمیل</p>
              <p className="text-2xl font-bold">{kpis.averageFulfillmentSeconds.toFixed(0)} ثانیه</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">سهم COD</p>
              <p className="text-2xl font-bold">{(kpis.codRatio * 100).toFixed(1)}%</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">کُنورژن پرداخت</p>
              <p className="text-2xl font-bold">{(kpis.paymentConversion * 100).toFixed(1)}%</p>
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-sm text-slate-500">PLACED → ACCEPTED</p>
              <p className="text-xl font-semibold">{formatSeconds(kpis.stageDurations.placedToAccepted)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">ACCEPTED → READY</p>
              <p className="text-xl font-semibold">{formatSeconds(kpis.stageDurations.acceptedToReady)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">READY → DELIVERED</p>
              <p className="text-xl font-semibold">{formatSeconds(kpis.stageDurations.readyToDelivered)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">PLACED → DELIVERED</p>
              <p className="text-xl font-semibold">{formatSeconds(kpis.stageDurations.placedToDelivered)}</p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">KPI روزانه (۷ روز)</h3>
              <span className="text-sm text-slate-500">سفارش، GMV، لغو، SLA</span>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-2 px-1">تاریخ</th>
                    <th className="py-2 px-1">سفارش</th>
                    <th className="py-2 px-1">GMV</th>
                    <th className="py-2 px-1">لغو</th>
                    <th className="py-2 px-1">پذیرش</th>
                    <th className="py-2 px-1">آمادگی</th>
                    <th className="py-2 px-1">تحویل</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.dailyKpis.map((day) => (
                    <tr key={day.date} className="border-t">
                      <td className="py-1 px-1">{day.date}</td>
                      <td className="py-1 px-1">{day.orders}</td>
                      <td className="py-1 px-1">{day.gmv.toLocaleString()}</td>
                      <td className="py-1 px-1">{(day.cancelRate * 100).toFixed(1)}%</td>
                      <td className="py-1 px-1">{formatSeconds(day.averageSeconds.placedToAccepted)}</td>
                      <td className="py-1 px-1">{formatSeconds(day.averageSeconds.acceptedToReady)}</td>
                      <td className="py-1 px-1">{formatSeconds(day.averageSeconds.readyToDelivered)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">عملکرد وندورها</h3>
              <span className="text-sm text-slate-500">حجم، لغو، SLA</span>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-2 px-1">وندور</th>
                    <th className="py-2 px-1">سفارش</th>
                    <th className="py-2 px-1">GMV</th>
                    <th className="py-2 px-1">نرخ لغو</th>
                    <th className="py-2 px-1">پذیرش</th>
                    <th className="py-2 px-1">آمادگی</th>
                    <th className="py-2 px-1">تحویل</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.vendorPerformance.map((vendor) => (
                    <tr key={vendor.vendorId} className="border-t">
                      <td className="py-1 px-1 font-semibold">{vendor.vendorName ?? vendor.vendorId}</td>
                      <td className="py-1 px-1">{vendor.orders}</td>
                      <td className="py-1 px-1">{vendor.sales.toLocaleString()}</td>
                      <td className="py-1 px-1">{(vendor.rejectionRate * 100).toFixed(1)}%</td>
                      <td className="py-1 px-1">{formatSeconds(vendor.averageSeconds.placedToAccepted)}</td>
                      <td className="py-1 px-1">{formatSeconds(vendor.averageSeconds.acceptedToReady)}</td>
                      <td className="py-1 px-1">{formatSeconds(vendor.averageSeconds.readyToDelivered)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {funnel && (
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">قیف سفر مشتری</h2>
              <span className="text-sm text-slate-500">منو → پرداخت → تحویل</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-sm text-slate-500">مشاهده منو</p>
                <p className="text-2xl font-bold">{funnel.menuViews}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">چک‌اوت</p>
                <p className="text-2xl font-bold">{funnel.checkout}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">پرداخت</p>
                <p className="text-2xl font-bold">{funnel.payment}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">تحویل</p>
                <p className="text-2xl font-bold">{funnel.delivered}</p>
              </div>
            </div>
          </div>
        )}

        {notificationHealth && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">سلامت اعلان‌ها</h2>
              <span className="text-sm text-slate-500">Queue + Delivery</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {notificationHealth.counts.map((c) => (
                <span key={`${c.channel}-${c.status}`} className="px-2 py-1 rounded bg-slate-100">
                  {c.channel} {c.status}: {c._count._all}
                </span>
              ))}
            </div>
            <div className="text-xs text-slate-600 grid grid-cols-2 gap-2">
              <div>
                <p className="font-semibold">Dispatcher</p>
                <pre className="bg-slate-50 p-2 rounded">
                  {JSON.stringify(notificationHealth.queue.dispatcherCounts ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="font-semibold">Dead-letter</p>
                <pre className="bg-slate-50 p-2 rounded">
                  {JSON.stringify(notificationHealth.queue.deadLetterCounts ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

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
                <th className="py-2 pr-4">ارسال</th>
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
                  <td className="py-2 pr-4">
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">
                        {order.deliveryProvider || order.deliveryType || 'N/A'}
                      </span>
                      {order.deliveryFeeEstimate && (
                        <span className="px-2 py-1 rounded bg-slate-50 text-slate-600">
                          برآورد پیک: {Number(order.deliveryFeeEstimate).toLocaleString()} تومان
                        </span>
                      )}
                      {order.outOfZone && <span className="px-2 py-1 rounded bg-rose-100 text-rose-800">خارج محدوده</span>}
                      {order.isCOD && <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">COD / پس‌کرایه</span>}
                      {order.courierStatus && (
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">پیک: {order.courierStatus}</span>
                      )}
                    </div>
                  </td>
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
                      <select
                        className="border rounded px-2 py-1"
                        value={orderDrafts[order.id]?.courierStatus ?? order.courierStatus ?? 'PENDING'}
                        onChange={(e) =>
                          setOrderDrafts((prev) => ({
                            ...prev,
                            [order.id]: { ...prev[order.id], courierStatus: e.target.value }
                          }))
                        }
                      >
                        {COURIER_STATUSES.map((status) => (
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
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={orderDrafts[order.id]?.isCOD ?? order.isCOD ?? false}
                          onChange={(e) =>
                            setOrderDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], isCOD: e.target.checked }
                            }))
                          }
                        />
                        COD
                      </label>
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
        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
          <input
            className="input"
            placeholder="نوع رویداد"
            value={eventFilters.eventName}
            onChange={(e) => setEventFilters({ ...eventFilters, eventName: e.target.value })}
          />
          <input
            className="input"
            placeholder="کد سفارش"
            value={eventFilters.orderId}
            onChange={(e) => setEventFilters({ ...eventFilters, orderId: e.target.value })}
          />
          <input
            className="input"
            placeholder="کاربر"
            value={eventFilters.userId}
            onChange={(e) => setEventFilters({ ...eventFilters, userId: e.target.value })}
          />
          <select
            className="input"
            value={eventFilters.actorType}
            onChange={(e) => setEventFilters({ ...eventFilters, actorType: e.target.value })}
          >
            <option value="">همه بازیگران</option>
            <option value="USER">USER</option>
            <option value="VENDOR">VENDOR</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SYSTEM">SYSTEM</option>
          </select>
          <input
            type="date"
            className="input"
            value={eventFilters.from}
            onChange={(e) => setEventFilters({ ...eventFilters, from: e.target.value })}
          />
          <input
            type="date"
            className="input"
            value={eventFilters.to}
            onChange={(e) => setEventFilters({ ...eventFilters, to: e.target.value })}
          />
          <div className="flex gap-2 md:col-span-2 lg:col-span-2">
            <button className="button" onClick={applyEventFilters}>
              اعمال فیلتر
            </button>
            <button className="button" onClick={exportEvents}>
              خروجی CSV
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">زمان</th>
                <th className="py-2 pr-4">جزئیات</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-1 pr-4">{e.eventName}</td>
                  <td className="py-1 pr-4">{e.actorType ?? '-'}</td>
                  <td className="py-1 pr-4 text-xs">{new Date(e.createdAt).toLocaleString()}</td>
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
