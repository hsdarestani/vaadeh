const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

export interface MenuVariant {
  id: string;
  code: string;
  price: number;
  isAvailable: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  variants: MenuVariant[];
}

export interface VendorMenu {
  id: string;
  name: string;
  serviceRadiusKm: number;
  menuItems: MenuItem[];
}

export interface Address {
  id: string;
  title: string;
  lat: number;
  lng: number;
  fullAddress: string;
  isDefault: boolean;
}

export interface OrderItemSummary {
  id: string;
  menuVariantId: string;
  qty: number;
  unitPrice: number;
}

export interface OrderSummary {
  id: string;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  deliveryFee: number;
  deliveryFeeEstimated?: number | null;
  deliveryProvider?: string;
  deliveryType?: string;
  isCOD?: boolean;
  createdAt: string;
  items?: OrderItemSummary[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    credentials: 'include'
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'درخواست با خطا مواجه شد');
  }

  return res.json();
}

export function requestOtp(mobile: string) {
  return apiFetch<{ codeSent: boolean }>(`/auth/request-otp`, {
    method: 'POST',
    body: JSON.stringify({ mobile })
  });
}

export function verifyOtpWeb(mobile: string, code: string) {
  return apiFetch<{ accessToken: string; refreshToken: string; user: any }>(`/auth/web/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ mobile, code })
  });
}

export function refreshSession(refreshToken?: string) {
  return apiFetch<{ accessToken: string; refreshToken: string }>(`/auth/web/refresh`, {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });
}

export function logoutWeb() {
  return apiFetch(`/auth/web/logout`, { method: 'POST' });
}

export function getProfile() {
  return apiFetch<{ id: string; mobile: string; addresses: Address[] }>(`/auth/me`);
}

export function getMenu() {
  return apiFetch<VendorMenu[]>(`/menu`);
}

export function listAddresses() {
  return apiFetch<Address[]>(`/addresses`);
}

export function createAddress(payload: Partial<Address>) {
  return apiFetch<Address>(`/addresses`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateAddress(id: string, payload: Partial<Address>) {
  return apiFetch<Address>(`/addresses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function setDefaultAddress(id: string) {
  return apiFetch<Address>(`/addresses/${id}/default`, { method: 'POST' });
}

export function deleteAddress(id: string) {
  return apiFetch(`/addresses/${id}`, { method: 'DELETE' });
}

export function listOrders() {
  return apiFetch<OrderSummary[]>(`/orders`);
}

export function getOrder(id: string) {
  return apiFetch<OrderSummary>(`/orders/${id}`);
}

export function createOrder(body: any) {
  return apiFetch(`/orders`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function requestPayment(orderId: string) {
  return apiFetch<{ payLink: string | null }>(`/payments/zibal/request`, {
    method: 'POST',
    body: JSON.stringify({ orderId })
  });
}

export function verifyPayment(trackId: string, orderId?: string) {
  return apiFetch(`/payments/zibal/verify`, {
    method: 'POST',
    body: JSON.stringify({ trackId, orderId })
  });
}
