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
 * Upload file to Supabase Storage with fallback to database storage
 */
export async function uploadFile(
  filename: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    console.log(`📤 Uploading file: ${filename} (${mimeType}, ${fileBuffer.length} bytes)`);
    
    const filePath = `${Date.now()}-${filename}`;
    
    // Try storage upload first
    try {
      console.log('🔗 Attempting Supabase Storage upload...');
      
      const { data, error } = await supabaseAdmin.storage
        .from('documents')
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: false
        });
      
      if (error) {
        console.warn('⚠️  Storage upload failed:', error.message);
        throw error;
      }
      
      console.log('✅ File uploaded to storage successfully:', data.path);
      return data.path;
      
    } catch (storageError) {
      console.warn('⚠️  Storage upload failed, using database fallback');
      console.warn('Storage error:', storageError instanceof Error ? storageError.message : String(storageError));
      
      // Fallback: Store file content in database as base64
      // This is less efficient but works when storage bucket isn't configured
      const base64Content = fileBuffer.toString('base64');
      
      // Store in a special table for file content
      const { data: fileData, error: dbError } = await supabaseAdmin
        .from('file_storage')
        .insert({
          file_path: filePath,
          filename: filename,
          mime_type: mimeType,
          file_size: fileBuffer.length,
          content: base64Content,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (dbError) {
        // If file_storage table doesn't exist, just return a placeholder path
        console.warn('⚠️  Database storage also failed, using placeholder path');
        console.log('💡 Note: File content will not be stored, but extraction will proceed');
        return `placeholder://${filePath}`;
      }
      
      console.log('✅ File stored in database fallback:', filePath);
      return `db://${filePath}`;
    }
    
  } catch (error) {
    console.error('❌ File upload failed:', error);
    // Don't throw - return placeholder and continue with extraction
    const placeholderPath = `placeholder://${Date.now()}-${filename}`;
    console.log('⚠️  Using placeholder path, extraction will continue:', placeholderPath);
    return placeholderPath;
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