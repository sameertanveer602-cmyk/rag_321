'use client';

import { useState, useEffect, useRef } from 'react';

// Types
interface HealthStatus {
  status: string;
  database: { connected: boolean };
  environment: { all_variables_present: boolean };
}

interface UploadResponse {
  status: string;
  total_chunks: number;
  doc_id: string;
}

interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  text: string;
  score: number;
  metadata?: any;
}

interface RAGSearchResponse {
  answer: string;
  sources?: RetrievedChunk[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: RetrievedChunk[];
}

interface ChatResponse {
  session_id: string;
  answer: string;
  history: ChatMessage[];
  sources?: RetrievedChunk[];
}

export default function Home() {
  // State management
  const [activeTab, setActiveTab] = useState<'upload' | 'search' | 'chat'>('upload');
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<RAGSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check health on component mount
  useEffect(() => {
    checkHealth();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // API Functions
  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealthStatus(data);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({ 
        status: 'error', 
        database: { connected: false }, 
        environment: { all_variables_present: false } 
      });
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setUploadProgress('Reading file...');
    setUploadResult(null);

    try {
      // Check file size before processing (50MB limit for Vercel)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (selectedFile.size > maxSize) {
        throw new Error(`File size (${(selectedFile.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit for serverless deployment`);
      }

      // Convert file to base64
      const fileBuffer = await selectedFile.arrayBuffer();
      const base64Content = Buffer.from(fileBuffer).toString('base64');

      setUploadProgress('Uploading and processing...');

      const uploadRequest = {
        filename: selectedFile.name,
        content: base64Content,
        metadata: {
          doc_id: `doc_${Date.now()}`,
          tags: ['uploaded', 'frontend']
        },
        chunk_size: 500,
        chunk_overlap: 50
      };

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 28000); // 28 seconds timeout

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uploadRequest),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if response is ok
        if (!response.ok) {
          let errorMessage = 'Upload failed';
          try {
            const errorResult = await response.json();
            errorMessage = errorResult.error || `HTTP ${response.status}: ${response.statusText}`;
          } catch (jsonError) {
            // If JSON parsing fails, use status text
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        // Try to parse JSON response
        let result;
        try {
          result = await response.json();
        } catch (jsonError) {
          throw new Error('Server returned invalid response. The upload may have timed out or failed.');
        }

        setUploadResult(result);
        setUploadProgress('Upload completed successfully!');
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            throw new Error('Upload timed out. Try uploading a smaller file or simpler document format.');
          }
          throw fetchError;
        }
        throw new Error('Network error occurred during upload');
      }

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setUploadProgress(`Upload failed: ${errorMessage}`);
      
      // Show helpful suggestions based on error type
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        setUploadProgress(prev => prev + '\n\nSuggestions:\n• Try a smaller file (under 10MB)\n• Use simpler formats (TXT, PDF without images)\n• Split large documents into smaller parts');
      } else if (errorMessage.includes('size') || errorMessage.includes('50MB')) {
        setUploadProgress(prev => prev + '\n\nTip: For large files, try splitting them into smaller documents or use a simpler format.');
      } else if (errorMessage.includes('JSON') || errorMessage.includes('invalid response')) {
        setUploadProgress(prev => prev + '\n\nThe server may be overloaded. Please try again in a few moments.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchResult(null);

    try {
      const searchRequest = {
        query: searchQuery,
        top_k: 5,
        include_sources: true
      };

      const response = await fetch('/api/rag-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchRequest)
      });

      if (response.ok) {
        const result = await response.json();
        setSearchResult(result);
      } else {
        const errorResult = await response.json();
        throw new Error(errorResult.error || 'Search failed');
      }
    } catch (error) {
      setSearchResult({
        answer: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sources: []
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const chatRequest = {
        session_id: sessionId,
        message: chatInput,
        top_k: 5
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatRequest)
      });

      if (response.ok) {
        const result: ChatResponse = await response.json();
        setSessionId(result.session_id);
        
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toISOString(),
          sources: result.sources
        };

        setChatMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorResult = await response.json();
        throw new Error(errorResult.error || 'Chat failed');
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    setSessionId(null);
  };

  const openFormattedResponse = (content: string, title: string) => {
    // Encode the HTML content to pass it safely in URL
    const encodedContent = btoa(encodeURIComponent(content));
    const encodedTitle = encodeURIComponent(title);
    
    // Open in new window/tab
    const url = `/response?content=${encodedContent}&title=${encodedTitle}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Production RAG System</h1>
              <p className="text-sm text-gray-600">Upload, Search, and Chat with Documents</p>
            </div>
            
            {/* Health Status */}
            <div className={`px-3 py-1 rounded-full text-sm font-medium border ${
              healthStatus?.status === 'healthy' ? 'status-healthy' :
              healthStatus?.status === 'unhealthy' ? 'status-unhealthy' : 'status-loading'
            }`}>
              {healthStatus?.status === 'healthy' ? '🟢 System Healthy' :
               healthStatus?.status === 'unhealthy' ? '🔴 System Unhealthy' : '🟡 Checking...'}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'upload', label: '📤 Upload Documents', icon: '📄' },
              { id: 'search', label: '🔍 RAG Search', icon: '🔎' },
              { id: 'chat', label: '💬 Chat Session', icon: '💭' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">📤 Document Upload</h2>
              <p className="text-gray-600 mb-6">
                Upload documents to be processed and indexed for search and chat. 
                Supports PDF, DOCX, PPTX, TXT, JSON, and image files.
              </p>

              <div className="space-y-4">
                {/* File Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Document
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    accept=".pdf,.docx,.pptx,.txt,.json,.jpg,.jpeg,.png,.gif,.webp"
                    className="input-field"
                  />
                  {selectedFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                {/* Upload Button */}
                <button
                  onClick={handleFileUpload}
                  disabled={!selectedFile || isLoading}
                  className="btn-primary"
                >
                  {isLoading ? 'Processing...' : 'Upload & Process Document'}
                </button>

                {/* Progress */}
                {uploadProgress && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-800">{uploadProgress}</p>
                  </div>
                )}

                {/* Upload Result */}
                {uploadResult && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="font-medium text-green-800 mb-2">✅ Upload Successful!</h3>
                    <div className="text-sm text-green-700 space-y-1">
                      <p><strong>Document ID:</strong> {uploadResult.doc_id}</p>
                      <p><strong>Total Chunks:</strong> {uploadResult.total_chunks}</p>
                      <p><strong>Status:</strong> {uploadResult.status}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">🔍 RAG Search</h2>
              <p className="text-gray-600 mb-6">
                Search through uploaded documents using semantic similarity. 
                Get AI-generated answers with source citations.
              </p>

              <div className="space-y-4">
                {/* Search Input */}
                <div className="flex space-x-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ask a question about your documents..."
                    className="input-field flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || searchLoading}
                    className="btn-primary"
                  >
                    {searchLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResult && (
                  <div className="space-y-4">
                    {/* Answer */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-blue-800">🤖 AI Answer</h3>
                        <button
                          onClick={() => openFormattedResponse(searchResult.answer, 'Search Result')}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                        >
                          📄 View Formatted
                        </button>
                      </div>
                      <div className="text-blue-900 whitespace-pre-wrap">
                        {searchResult.answer}
                      </div>
                    </div>

                    {/* Sources */}
                    {searchResult.sources && searchResult.sources.length > 0 && (
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <h3 className="font-medium text-gray-800 mb-3">📚 Sources ({searchResult.sources.length})</h3>
                        <div className="space-y-3">
                          {searchResult.sources.map((source, index) => (
                            <div key={source.chunk_id} className="p-3 bg-white border rounded-lg">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-sm font-medium text-gray-600">
                                  Source {index + 1} • Score: {(source.score * 100).toFixed(1)}%
                                </span>
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {source.metadata?.extraction_type || 'text'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-800 line-clamp-3">
                                {source.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">💬 Chat Session</h2>
                <div className="flex space-x-2">
                  {sessionId && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Session: {sessionId.slice(0, 8)}...
                    </span>
                  )}
                  <button onClick={clearChat} className="btn-secondary text-sm">
                    Clear Chat
                  </button>
                </div>
              </div>
              
              <p className="text-gray-600 mb-6">
                Have a conversation with your documents. Chat maintains context and provides source citations.
              </p>

              {/* Chat Messages */}
              <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 mb-4 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p>💭 Start a conversation by asking a question about your documents</p>
                  </div>
                ) : (
                  chatMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs opacity-75">
                            {message.role === 'user' ? '👤' : '🤖'}
                          </span>
                          {message.role === 'assistant' && (
                            <button
                              onClick={() => openFormattedResponse(message.content, `Chat Response ${index + 1}`)}
                              className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors ml-2"
                            >
                              📄
                            </button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-300">
                            <p className="text-xs opacity-75">
                              📚 {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="animate-pulse">🤖</div>
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  className="input-field flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleChatMessage()}
                  disabled={chatLoading}
                />
                <button
                  onClick={handleChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="btn-primary"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}