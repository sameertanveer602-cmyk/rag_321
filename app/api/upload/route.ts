// =============================================================================
// DOCUMENT UPLOAD API ENDPOINT
// Exact implementation of UploadRequest/UploadResponse models
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, uploadFile } from '@/lib/supabase';
import { extractContent, detectMimeType, validateFileSize } from '@/lib/extractors';
import { chunkContent, storeDocumentsWithEmbeddings } from '@/lib/langchain';
import { UploadRequest, UploadResponse, SupportedMimeType } from '@/lib/types';

/**
 * Document Upload API Endpoint
 * 
 * Request Model (UploadRequest):
 * - filename: string (required) - Name of the file
 * - content: string (required) - Base64 encoded file content
 * - metadata?: DocumentMetadata - Optional document metadata
 * - chunk_size?: number (default: 500) - Size of text chunks
 * - chunk_overlap?: number (default: 50) - Overlap between chunks
 * 
 * Response Model (UploadResponse):
 * - status: string - Processing status
 * - total_chunks: number - Number of chunks created
 * - doc_id: string - Unique document identifier
 */
export async function POST(request: NextRequest) {
  console.log('📤 Document upload request received');
  
  try {
    // Parse and validate request
    const body: UploadRequest = await request.json();
    const { 
      filename, 
      content, 
      metadata, 
      chunk_size = 500, 
      chunk_overlap = 50 
    } = body;
    
    // Validate required fields
    if (!filename || !content) {
      return NextResponse.json(
        { error: 'filename and content are required', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    
    console.log(`📄 Processing file: ${filename}`);
    console.log(`⚙️  Chunk size: ${chunk_size}, overlap: ${chunk_overlap}`);
    
    // Decode base64 content
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, 'base64');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid base64 content', code: 'INVALID_CONTENT' },
        { status: 400 }
      );
    }
    
    // Validate file size (100MB limit)
    if (!validateFileSize(fileBuffer, 100)) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB limit', code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }
    
    // Detect MIME type
    const mimeType = detectMimeType(filename);
    if (!mimeType) {
      return NextResponse.json(
        { error: 'Unsupported file type', code: 'UNSUPPORTED_FILE_TYPE' },
        { status: 400 }
      );
    }
    
    console.log(`🔍 Detected MIME type: ${mimeType}`);
    
    // Generate document ID
    const docId = metadata?.doc_id || `doc_${uuidv4()}`;
    
    // STEP 1: Upload raw file to Supabase Storage
    console.log('☁️  Uploading file to Supabase Storage...');
    const filePath = await uploadFile(filename, fileBuffer, mimeType);
    console.log(`✅ File uploaded to: ${filePath}`);
    
    // STEP 2: Extract content from file
    console.log('🔍 Extracting content from file...');
    const extractedContent = await extractContent(fileBuffer, filename, mimeType as SupportedMimeType);
    console.log(`✅ Extracted ${extractedContent.length} content elements`);
    
    // Log extraction summary
    const extractionSummary = extractedContent.reduce((acc, content) => {
      acc[content.type] = (acc[content.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('📊 Extraction summary:', extractionSummary);
    
    // STEP 3: Chunk content using LangChain
    console.log('✂️  Chunking content...');
    const chunks = await chunkContent(extractedContent, chunk_size, chunk_overlap);
    console.log(`✅ Created ${chunks.length} chunks`);
    
    // STEP 4: Store document metadata in database
    console.log('💾 Storing document metadata...');
    const { data: documentData, error: documentError } = await supabaseAdmin
      .from('documents')
      .insert({
        filename,
        file_path: filePath,
        mime_type: mimeType,
        file_size: fileBuffer.length,
        doc_id: docId,
        metadata: {
          ...metadata,
          extraction_summary: extractionSummary,
          chunk_size,
          chunk_overlap,
          total_chunks: chunks.length
        }
      })
      .select()
      .single();
    
    if (documentError) {
      console.error('❌ Failed to store document metadata:', documentError);
      throw new Error(`Database error: ${documentError.message}`);
    }
    
    console.log(`✅ Document metadata stored with ID: ${documentData.id}`);
    
    // STEP 5: Process embeddings and store chunks (individual processing)
    console.log('🧠 Processing embeddings and storing chunks...');
    await storeDocumentsWithEmbeddings(chunks, documentData.id); // Pass UUID, not doc_id string
    console.log('✅ All chunks processed and stored with embeddings');
    
    // Build response
    const response: UploadResponse = {
      status: 'success',
      total_chunks: chunks.length,
      doc_id: docId
    };
    
    console.log(`🎉 Upload completed successfully: ${chunks.length} chunks processed`);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Upload processing failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Upload processing failed',
        code: 'PROCESSING_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle multipart form uploads (alternative to base64)
 */
export async function PUT(request: NextRequest) {
  console.log('📤 Multipart file upload request received');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadataStr = formData.get('metadata') as string;
    const chunkSize = parseInt(formData.get('chunk_size') as string) || 500;
    const chunkOverlap = parseInt(formData.get('chunk_overlap') as string) || 50;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', code: 'NO_FILE' },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    
    // Parse metadata if provided
    let metadata;
    try {
      metadata = metadataStr ? JSON.parse(metadataStr) : undefined;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid metadata JSON', code: 'INVALID_METADATA' },
        { status: 400 }
      );
    }
    
    // Convert to base64 and use the main POST handler logic
    const base64Content = fileBuffer.toString('base64');
    
    const uploadRequest: UploadRequest = {
      filename: file.name,
      content: base64Content,
      metadata,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap
    };
    
    // Create a new request with the converted data
    const newRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadRequest)
    });
    
    // Use the POST handler
    return POST(newRequest);
    
  } catch (error) {
    console.error('❌ Multipart upload failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Multipart upload failed',
        code: 'MULTIPART_ERROR'
      },
      { status: 500 }
    );
  }
}