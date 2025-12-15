import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthProvider } from '@/src/providers/auth-provider';
import { CartProvider } from '@/src/providers/cart-provider';
import { UserMenu } from '@/src/components/user-menu';

export const metadata: Metadata = {
  title: 'Vaadeh | سفارش آنلاین',
  description: 'منوی آنلاین و سفارش سریع با پیگیری لحظه‌ای'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-slate-950">
        <AuthProvider>
          <CartProvider>
            <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
              <header className="flex items-center justify-between">
                <Link href="/menu" className="text-2xl font-bold text-white">
                  Vaadeh
                </Link>
                <div className="flex items-center gap-4 text-sm text-slate-200">
                  <nav className="flex items-center gap-3">
                    <Link className="hover:text-white" href="/menu">
                      منو
                    </Link>
                    <Link className="hover:text-white" href="/addresses">
                      آدرس‌ها
                    </Link>
                    <Link className="hover:text-white" href="/orders">
                      سفارش‌ها
                    </Link>
                  </nav>
                  <UserMenu />
                </div>
              </header>
              {children}
            </div>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
