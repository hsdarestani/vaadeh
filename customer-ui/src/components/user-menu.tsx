'use client';

import Link from 'next/link';
import { useAuth } from '@/src/providers/auth-provider';

export function UserMenu() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return <div className="spinner" />;
  }

  if (!user) {
    return (
      <Link className="btn-secondary text-sm" href="/login">
        ورود
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-slate-200 text-sm">
      <span className="hidden sm:inline">{user.mobile}</span>
      <button className="btn-secondary" onClick={logout}>
        خروج
      </button>
    </div>
  );
}
