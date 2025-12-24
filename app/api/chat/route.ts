// =============================================================================
// CHAT / SESSION API ENDPOINT
// Exact implementation of ChatRequest/ChatResponse models
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { similaritySearch, generateChatResponse } from '@/lib/langchain';
import { ChatRequest, ChatResponse, ChatMessage, RetrievedChunk } from '@/lib/types';

/**
 * Chat / Session API Endpoint
 * 
 * Request Model (ChatRequest):
 * - session_id?: string - Existing session ID; creates new if not provided
 * - message: string (required) - User's message
 * - top_k?: number (default: 5) - Number of chunks to retrieve
 * 
 * Key Features:
 * - Defines a message in a multi-turn chat session with optional session ID
 * - If a session exists, previous history is reused; otherwise a new session is created
 * - Supports RAG answering in a conversational context
 * 
 * Response Model (ChatResponse):
 * - session_id: string - Session identifier (new or existing)
 * - answer: string - AI-generated response
 * - history: List[dict] - Full conversation history for this session
 * - sources?: List[RetrievedChunk] - Retrieved evidence chunks
 * 
 * Purpose:
 * - Returns the AI reply along with the session ID and full chat history
 * - Includes retrieved evidence chunks from the vector DB
 * - Allows frontend to maintain consistent multi-turn RAG conversations
 */
export async function POST(request: NextRequest) {
  console.log('💬 Chat request received');
  
  try {
    // Parse and validate request
    const body: ChatRequest = await request.json();
    const { session_id, message, top_k = 5 } = body;
    
    // Validate required fields
    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required and cannot be empty', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    
    if (top_k < 1 || top_k > 50) {
      return NextResponse.json(
        { error: 'top_k must be between 1 and 50', code: 'INVALID_TOP_K' },
        { status: 400 }
      );
    }
    
    console.log(`💬 Message: "${message}"`);
    console.log(`🔗 Session ID: ${session_id || 'new session'}`);
    console.log(`📊 Retrieving top ${top_k} chunks`);
    
    let sessionId: string;
    let chatHistory: ChatMessage[] = [];
    let isNewSession = false;
    
    // STEP 1: Session Management
    if (session_id) {
      // Use existing session - retrieve history
      sessionId = session_id;
      console.log(`🔍 Looking up existing session: ${session_id}`);
      
      // Verify session exists
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, session_name')
        .eq('session_id', session_id)
        .single();
      
      if (sessionError || !sessionData) {
        console.log(`❌ Session not found: ${session_id}`);
        return NextResponse.json(
          { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      console.log(`✅ Found existing session: ${sessionData.session_name || 'Unnamed'}`);
      
      // Retrieve full chat history for this session
      const { data: historyData, error: historyError } = await supabaseAdmin
        .from('session_messages')
        .select('role, content, sources, created_at')
        .eq('session_id', sessionData.id)
        .order('message_index', { ascending: true });
      
      if (!historyError && historyData) {
        chatHistory = historyData.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.created_at,
          sources: msg.sources
        }));
        console.log(`📚 Retrieved ${chatHistory.length} messages from history`);
      }
    } else {
      // Create new session
      sessionId = `session_${uuidv4()}`;
      isNewSession = true;
      console.log(`🆕 Creating new session: ${sessionId}`);
      
      const { error: createError } = await supabaseAdmin
        .from('chat_sessions')
        .insert({
          session_id: sessionId,
          session_name: `Chat ${new Date().toLocaleString()}`
        });
      
      if (createError) {
        console.error('❌ Failed to create session:', createError);
        // Continue anyway - session storage is not critical for response
      } else {
        console.log('✅ New session created successfully');
      }
    }
    
    // STEP 2: Perform RAG similarity search
    console.log('🧠 Performing similarity search for chat context...');
    const retrievedChunks = await similaritySearch(message.trim(), top_k);
    
    // Filter by relevance threshold
    const minThreshold = 0.05; // Lowered threshold for better multilingual support
    const relevantChunks = retrievedChunks.filter(chunk => chunk.score >= minThreshold);
    
    console.log(`✅ Found ${relevantChunks.length} relevant chunks for chat context`);
    
    // STEP 3: Generate AI response using context and history
    let answer: string;
    if (relevantChunks.length === 0) {
      console.log('⚠️  No relevant chunks found, generating response without RAG context');
      answer = "I couldn't find relevant information in the uploaded documents to answer your question. Please ensure relevant documents are uploaded or try rephrasing your question with different keywords.";
    } else {
      console.log('🤖 Generating chat response with RAG context and history...');
      // Pass chat history for context-aware responses
      const historyForLLM = chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      answer = await generateChatResponse(message.trim(), relevantChunks, historyForLLM);
      console.log(`✅ Generated chat response (${answer.length} characters)`);
    }
    
    // STEP 4: Store messages in session history
    const nextMessageIndex = chatHistory.length;
    
    // Get session database ID for foreign key
    const { data: sessionDbData } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .single();
    
    if (sessionDbData) {
      console.log('💾 Storing messages in session history...');
      const { error: insertError } = await supabaseAdmin
        .from('session_messages')
        .insert([
          {
            session_id: sessionDbData.id,
            role: 'user',
            content: message,
            sources: [],
            message_index: nextMessageIndex
          },
          {
            session_id: sessionDbData.id,
            role: 'assistant',
            content: answer,
            sources: relevantChunks,
            message_index: nextMessageIndex + 1
          }
        ]);
      
      if (insertError) {
        console.error('❌ Failed to store messages:', insertError);
      } else {
        console.log('✅ Messages stored in session history');
      }
      
      // Update session timestamp
      await supabaseAdmin
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionDbData.id);
    }
    
    // STEP 5: Build complete history including new messages
    const updatedHistory: ChatMessage[] = [
      ...chatHistory,
      {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: answer,
        timestamp: new Date().toISOString(),
        sources: relevantChunks.length > 0 ? relevantChunks : undefined
      }
    ];
    
    // STEP 6: Build response according to ChatResponse model
    const response: ChatResponse = {
      session_id: sessionId,
      answer,
      history: updatedHistory,
      sources: relevantChunks.length > 0 ? relevantChunks : undefined
    };
    
    console.log(`🎉 Chat completed successfully (${isNewSession ? 'new' : 'existing'} session)`);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Chat processing failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Chat processing failed',
        code: 'CHAT_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for session management and API documentation
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  
  if (sessionId) {
    // Return session history
    try {
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, session_name, created_at, updated_at')
        .eq('session_id', sessionId)
        .single();
      
      if (sessionError || !sessionData) {
        return NextResponse.json(
          { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
          { status: 404 }
        );
      }
      
      const { data: historyData, error: historyError } = await supabaseAdmin
        .from('session_messages')
        .select('role, content, sources, created_at, message_index')
        .eq('session_id', sessionData.id)
        .order('message_index', { ascending: true });
      
      const history = historyData?.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at,
        sources: msg.sources
      })) || [];
      
      return NextResponse.json({
        session_id: sessionId,
        session_name: sessionData.session_name,
        created_at: sessionData.created_at,
        updated_at: sessionData.updated_at,
        message_count: history.length,
        history
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to retrieve session', code: 'SESSION_ERROR' },
        { status: 500 }
      );
    }
  }
  
  // Return API documentation
  return NextResponse.json({
    endpoint: '/api/chat',
    method: 'POST',
    description: 'Conversational RAG with session management',
    request_model: {
      session_id: 'string (optional) - Existing session ID',
      message: 'string (required) - User message',
      top_k: 'number (optional, default: 5) - Number of chunks to retrieve'
    },
    response_model: {
      session_id: 'string - Session identifier',
      answer: 'string - AI response',
      history: 'ChatMessage[] - Full conversation history',
      sources: 'RetrievedChunk[] (optional) - Source chunks'
    },
    example_request: {
      session_id: "session_12345",
      message: "What are the key findings?",
      top_k: 5
    },
    session_management: {
      get_session: 'GET /api/chat?session_id=<id>',
      description: 'Retrieve session history and metadata'
    }
  });
}