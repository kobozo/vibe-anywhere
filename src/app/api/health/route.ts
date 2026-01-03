import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db';

export async function GET() {
  const dbHealthy = await checkDatabaseConnection();

  const status = {
    status: dbHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'ok' : 'error',
    },
  };

  return NextResponse.json(status, { status: dbHealthy ? 200 : 503 });
}
