const requiredEnv = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ZIBAL_MERCHANT',
  'ZIBAL_CALLBACK_URL',
  'MELIPAYAMAK_USERNAME',
  'MELIPAYAMAK_PASSWORD',
  'MELIPAYAMAK_FROM',
  'TELEGRAM_CUSTOMER_BOT_TOKEN',
  'TELEGRAM_VENDOR_BOT_TOKEN',
  'REDIS_URL',
  'SNAPP_API_BASE_URL',
  'SNAPP_CLIENT_ID',
  'SNAPP_CLIENT_SECRET'
];

const numericEnv = ['INTERNAL_DELIVERY_FEE', 'SNAPP_COD_MAX_KM'];

export function validateEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    requiredEnv.push('ZIBAL_CALLBACK_SECRET');
    requiredEnv.push('SNAPP_WEBHOOK_SECRET');
    requiredEnv.push('ALLOWED_ORIGINS');
  }
  const missing = requiredEnv.filter((key) => !process.env[key] || process.env[key] === '');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const invalidNumeric = numericEnv.filter((key) => {
    if (!process.env[key]) return false;
    return Number.isNaN(Number(process.env[key]));
  });

  if (invalidNumeric.length) {
    throw new Error(`Environment variables must be numeric: ${invalidNumeric.join(', ')}`);
  }
}
