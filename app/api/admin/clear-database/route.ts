// =============================================================================
// DATABASE CLEANUP API ENDPOINT
// Clear all data from the database
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: NextRequest) {
  console.log('🗑️  Database cleanup request received');
  
  try {
    // Security check - only allow in development or with admin key
    const adminKey = request.headers.get('x-admin-key');
    const isDevelopment = process.env.NODE_ENV === 'development';
    const validAdminKey = process.env.ADMIN_KEY || 'dev-admin-key';
    
    if (!isDevelopment && adminKey !== validAdminKey) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin key required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    console.log('🔐 Authorization verified, proceeding with cleanup...');
    
    let deletedCounts = {
      chunks: 0,
      documents: 0,
      sessions: 0,
      messages: 0,
      storage_files: 0
    };
    
    // Use a more reliable deletion approach
    console.log('🗑️  Starting database cleanup...');
    
    // Step 1: Delete document chunks (contains embeddings)
    console.log('🗑️  Deleting document chunks...');
    try {
      // First get count
      const { count: initialChunksCount } = await supabaseAdmin
        .from('document_chunks')
        .select('*', { count: 'exact', head: true });
      
      // Delete all chunks
      const { error: chunksError } = await supabaseAdmin
        .from('document_chunks')
        .delete()
        .not('id', 'is', null); // Delete all records
      
      if (chunksError) {
        console.error('❌ Failed to delete chunks:', chunksError);
      } else {
        deletedCounts.chunks = initialChunksCount || 0;
        console.log(`✅ Deleted ${deletedCounts.chunks} document chunks`);
      }
    } catch (error) {
      console.error('❌ Error deleting chunks:', error);
    }
    
    // Step 2: Delete session messages
    console.log('🗑️  Deleting session messages...');
    try {
      // First get count
      const { count: initialMessagesCount } = await supabaseAdmin
        .from('session_messages')
        .select('*', { count: 'exact', head: true });
      
      // Delete all messages
      const { error: messagesError } = await supabaseAdmin
        .from('session_messages')
        .delete()
        .not('id', 'is', null); // Delete all records
      
      if (messagesError) {
        console.error('❌ Failed to delete messages:', messagesError);
      } else {
        deletedCounts.messages = initialMessagesCount || 0;
        console.log(`✅ Deleted ${deletedCounts.messages} session messages`);
      }
    } catch (error) {
      console.error('❌ Error deleting messages:', error);
    }
    
    // Step 3: Delete chat sessions
    console.log('🗑️  Deleting chat sessions...');
    try {
      // First get count
      const { count: initialSessionsCount } = await supabaseAdmin
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true });
      
      // Delete all sessions
      const { error: sessionsError } = await supabaseAdmin
        .from('chat_sessions')
        .delete()
        .not('id', 'is', null); // Delete all records
      
      if (sessionsError) {
        console.error('❌ Failed to delete sessions:', sessionsError);
      } else {
        deletedCounts.sessions = initialSessionsCount || 0;
        console.log(`✅ Deleted ${deletedCounts.sessions} chat sessions`);
      }
    } catch (error) {
      console.error('❌ Error deleting sessions:', error);
    }
    
    // Step 4: Delete documents
    console.log('🗑️  Deleting documents...');
    try {
      // First get count
      const { count: initialDocumentsCount } = await supabaseAdmin
        .from('documents')
        .select('*', { count: 'exact', head: true });
      
      // Delete all documents
      const { error: documentsError } = await supabaseAdmin
        .from('documents')
        .delete()
        .not('id', 'is', null); // Delete all records
      
      if (documentsError) {
        console.error('❌ Failed to delete documents:', documentsError);
      } else {
        deletedCounts.documents = initialDocumentsCount || 0;
        console.log(`✅ Deleted ${deletedCounts.documents} documents`);
      }
    } catch (error) {
      console.error('❌ Error deleting documents:', error);
    }
    
    // Step 5: Clear storage bucket
    console.log('🗑️  Clearing storage bucket...');
    try {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from('documents')
        .list();
      
      if (listError) {
        console.error('❌ Failed to list storage files:', listError);
      } else if (files && files.length > 0) {
        const filePaths = files.map(file => file.name);
        const { error: deleteError } = await supabaseAdmin.storage
          .from('documents')
          .remove(filePaths);
        
        if (deleteError) {
          console.error('❌ Failed to delete storage files:', deleteError);
        } else {
          deletedCounts.storage_files = files.length;
          console.log(`✅ Deleted ${deletedCounts.storage_files} storage files`);
        }
      }
    } catch (storageError) {
      console.error('❌ Storage cleanup failed:', storageError);
    }
    
    // Step 6: Reset sequences (optional)
    console.log('🔄 Resetting database sequences...');
    try {
      // This will reset auto-increment counters if any
      await supabaseAdmin.rpc('reset_sequences');
    } catch (sequenceError) {
      console.log('ℹ️  Sequence reset not available (this is normal)');
    }
    
    const response = {
      status: 'success',
      message: 'Database cleared successfully',
      deleted_counts: deletedCounts,
      total_deleted: Object.values(deletedCounts).reduce((sum, count) => sum + count, 0),
      timestamp: new Date().toISOString()
    };
    
    console.log('🎉 Database cleanup completed successfully');
    console.log('📊 Cleanup summary:', deletedCounts);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Database cleanup failed',
        code: 'CLEANUP_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for cleanup status and confirmation
 */
export async function GET(request: NextRequest) {
  try {
    // Get current database stats
    const { count: documentsCount } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true });
    
    const { count: chunksCount } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });
    
    const { count: sessionsCount } = await supabaseAdmin
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true });
    
    const { count: messagesCount } = await supabaseAdmin
      .from('session_messages')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({
      endpoint: '/api/admin/clear-database',
      method: 'DELETE',
      description: 'Clear all data from the database',
      current_counts: {
        documents: documentsCount || 0,
        chunks: chunksCount || 0,
        sessions: sessionsCount || 0,
        messages: messagesCount || 0
      },
      usage: {
        development: 'DELETE /api/admin/clear-database',
        production: 'DELETE /api/admin/clear-database (with x-admin-key header)'
      },
      warning: 'This operation is irreversible and will delete ALL data'
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get database status' },
      { status: 500 }
    );
  }
}