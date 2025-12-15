'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestOtp } from '@/src/lib/api-client';
import { useAuth } from '@/src/providers/auth-provider';

export default function LoginPage() {
  const router = useRouter();
  const { loginWithOtp, user } = useAuth();
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequest = async () => {
    setLoading(true);
    setError('');
    try {
      await requestOtp(mobile);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'ارسال کد ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    try {
      await loginWithOtp(mobile, code);
      router.replace('/menu');
    } catch (err: any) {
      setError(err.message || 'ورود ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    router.replace('/menu');
    return null;
  }

  return (
    <motion.div
      className="card mx-auto max-w-md p-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-white">ورود به حساب</h1>
        <p className="text-slate-300 text-sm">کد یکبار مصرف برای موبایل ثبت‌شده ارسال می‌شود.</p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm text-slate-300">شماره موبایل</label>
          <input
            className="input mt-1"
            placeholder="09xxxxxxxxx"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>

        {sent && (
          <div>
            <label className="text-sm text-slate-300">کد تایید</label>
            <input
              className="input mt-1"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        {!sent ? (
          <button disabled={loading || !mobile} className="btn-primary w-full" onClick={handleRequest}>
            {loading ? '...' : 'دریافت کد'}
          </button>
        ) : (
          <button disabled={loading || !code} className="btn-primary w-full" onClick={handleVerify}>
            {loading ? '...' : 'ورود'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
