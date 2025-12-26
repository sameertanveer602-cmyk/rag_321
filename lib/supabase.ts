// =============================================================================
// SUPABASE CLIENT CONFIGURATION
// Production-grade setup with proper error handling
// =============================================================================

import { createClient } from '@supabase/supabase-js';

// Environment variables validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// =============================================================================
// CLIENT INSTANCES
// =============================================================================

// Public client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

// Admin client for server-side operations with full permissions
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('count(*)')
      .limit(1);
    
    return !error;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_document_stats');
    
    if (error) {
      throw new Error(`Failed to get database stats: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to get database stats:', error);
    throw error;
  }
}

/**
 * Clean up orphaned chunks
 */
export async function cleanupOrphanedChunks(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_orphaned_chunks');
    
    if (error) {
      throw new Error(`Failed to cleanup orphaned chunks: ${error.message}`);
    }
    
    return data || 0;
  } catch (error) {
    console.error('Failed to cleanup orphaned chunks:', error);
    throw error;
  }
}

// =============================================================================
// STORAGE UTILITIES
// =============================================================================

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(
  filename: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    console.log(`📤 Uploading file: ${filename} (${mimeType}, ${fileBuffer.length} bytes)`);
    
    const filePath = `${Date.now()}-${filename}`;
    
    // Test connection first
    console.log('🔗 Testing Supabase connection...');
    const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Failed to list buckets:', bucketsError);
      throw new Error(`Storage connection failed: ${bucketsError.message}`);
    }
    
    console.log('✅ Supabase connection successful, buckets:', buckets?.map(b => b.name));
    
    // Check if documents bucket exists
    const documentsBucket = buckets?.find(b => b.name === 'documents');
    if (!documentsBucket) {
      console.error('❌ Documents bucket not found. Available buckets:', buckets?.map(b => b.name));
      throw new Error('Documents storage bucket not found. Please create it in Supabase.');
    }
    
    console.log('📁 Documents bucket found, uploading file...');
    
    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        duplex: 'half'
      });
    
    if (error) {
      console.error('❌ Storage upload error:', error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    
    console.log('✅ File uploaded successfully:', data.path);
    return data.path;
  } catch (error) {
    console.error('❌ File upload failed:', error);
    throw error;
  }
}

/**
 * Download file from Supabase Storage
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);
    
    if (error) {
      throw new Error(`Storage download failed: ${error.message}`);
    }
    
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.error('File download failed:', error);
    throw error;
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.storage
      .from('documents')
      .remove([filePath]);
    
    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  } catch (error) {
    console.error('File delete failed:', error);
    throw error;
  }
}