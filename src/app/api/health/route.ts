import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function releaseMetadata() {
  return {
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    environment:
      process.env.VERCEL_TARGET_ENV ?? process.env.NODE_ENV ?? 'development',
  };
}

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'chicmagnolia',
      timestamp: new Date().toISOString(),
      ...releaseMetadata(),
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
