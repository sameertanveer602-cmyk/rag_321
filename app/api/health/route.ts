// =============================================================================
// HEALTH CHECK API ENDPOINT
// System status and database connectivity
// =============================================================================

import { NextResponse } from 'next/server';
import { testConnection, getDatabaseStats } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('🏥 Health check requested');
    
    // Test database connection
    const dbConnected = await testConnection();
    
    let stats = null;
    if (dbConnected) {
      try {
        stats = await getDatabaseStats();
      } catch (error) {
        console.warn('⚠️  Could not retrieve database stats:', error);
      }
    }
    
    // Check environment variables
    const envCheck = {
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      gemini_api_key: !!process.env.GEMINI_API_KEY,
    };
    
    const allEnvPresent = Object.values(envCheck).every(Boolean);
    
    const health = {
      status: dbConnected && allEnvPresent ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        stats: stats || 'unavailable'
      },
      environment: {
        all_variables_present: allEnvPresent,
        details: envCheck
      },
      services: {
        supabase: dbConnected ? 'operational' : 'down',
        gemini_api: envCheck.gemini_api_key ? 'configured' : 'not_configured',
        vector_store: dbConnected ? 'operational' : 'down'
      }
    };
    
    console.log(`✅ Health check completed: ${health.status}`);
    
    return NextResponse.json(health, {
      status: health.status === 'healthy' ? 200 : 503
    });
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed'
    }, { status: 500 });
  }
}