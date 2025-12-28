'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ResponsePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [title, setTitle] = useState<string>('Response');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get HTML content from URL parameters
    const content = searchParams.get('content');
    const responseTitle = searchParams.get('title');
    
    if (content) {
      try {
        // Decode the base64 encoded HTML content
        const decodedContent = decodeURIComponent(atob(content));
        setHtmlContent(decodedContent);
        setTitle(responseTitle || 'AI Response');
      } catch (error) {
        console.error('Error decoding content:', error);
        setHtmlContent('<p class="error">Error loading response content.</p>');
      }
    } else {
      setHtmlContent('<p class="error">No content provided.</p>');
    }
    
    setIsLoading(false);
  }, [searchParams]);

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    router.back();
  };

  const handleCopy = () => {
    // Create a temporary element to copy the formatted text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Get text content for copying
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    
    navigator.clipboard.writeText(textContent).then(() => {
      alert('Content copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy content:', err);
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading response...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600">AI-Generated Response</p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                📋 Copy
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
              >
                🖨️ Print
              </button>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <div 
            className="response-content"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      </main>

      {/* Styles for the response content */}
      <style jsx global>{`
        .response-content {
          line-height: 1.7;
          color: #374151;
        }

        .response-content h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 1.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .response-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #1f2937;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .response-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #374151;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }

        .response-content h4 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #374151;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }

        .response-content p {
          margin-bottom: 1rem;
          text-align: justify;
        }

        .response-content ul, .response-content ol {
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }

        .response-content li {
          margin-bottom: 0.5rem;
        }

        .response-content blockquote {
          border-left: 4px solid #3b82f6;
          padding-left: 1rem;
          margin: 1.5rem 0;
          font-style: italic;
          background-color: #f8fafc;
          padding: 1rem;
          border-radius: 0.375rem;
        }

        .response-content cite {
          background-color: #eff6ff;
          color: #1d4ed8;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .response-content strong {
          font-weight: 600;
          color: #1f2937;
        }

        .response-content em {
          font-style: italic;
        }

        .response-content .source-section {
          margin: 1.5rem 0;
          padding: 1rem;
          background-color: #f9fafb;
          border-radius: 0.5rem;
          border-left: 4px solid #10b981;
        }

        .response-content .chapter-section {
          margin: 1.5rem 0;
          padding: 1rem;
          background-color: #fef3c7;
          border-radius: 0.5rem;
          border-left: 4px solid #f59e0b;
        }

        .response-content .error {
          color: #dc2626;
          background-color: #fef2f2;
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid #fecaca;
        }

        /* Table Styles */
        .response-content table,
        .response-content .data-table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          background-color: white;
          border-radius: 0.5rem;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
        }

        .response-content table caption {
          caption-side: top;
          padding: 1rem;
          font-weight: 700;
          font-size: 1.125rem;
          color: #1f2937;
          background-color: #f9fafb;
          text-align: center;
          border-bottom: 2px solid #e5e7eb;
        }

        .response-content table th {
          background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
          color: white;
          font-weight: 700;
          padding: 1rem;
          text-align: left;
          border-bottom: 3px solid #4b5563;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .response-content table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          transition: background-color 0.2s ease;
        }

        .response-content table tbody tr:hover {
          background-color: #f0f9ff;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .response-content table tbody tr:nth-child(even) {
          background-color: #f8fafc;
        }

        .response-content table tbody tr:nth-child(odd) {
          background-color: #ffffff;
        }

        /* Special row styling */
        .response-content table .total-row {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          font-weight: 700;
          border-top: 2px solid #f59e0b;
        }

        .response-content table .total-row td {
          border-bottom: none;
          padding: 1rem;
        }

        .response-content table .header-row {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          font-weight: 600;
        }

        /* Hebrew/RTL Support */
        .response-content [dir="rtl"] {
          direction: rtl;
          text-align: right;
        }

        .response-content table th[dir="rtl"],
        .response-content table td[dir="rtl"] {
          text-align: right;
        }

        /* Hebrew Table Specific Styles */
        .response-content table.hebrew-table {
          direction: rtl;
          font-family: 'Segoe UI', 'Arial Unicode MS', sans-serif;
        }

        .response-content table.hebrew-table th,
        .response-content table.hebrew-table td {
          text-align: right;
          direction: rtl;
        }

        .response-content table.hebrew-table caption {
          direction: rtl;
          text-align: center;
        }

        /* Currency and Number Formatting */
        .response-content .currency {
          font-weight: 700;
          color: #059669;
          background-color: #d1fae5;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', monospace;
        }

        .response-content .number {
          font-family: 'Courier New', monospace;
          font-weight: 600;
          color: #1f2937;
        }

        /* Enhanced Visual Elements */
        .response-content table td strong,
        .response-content table th strong {
          color: #1f2937;
          font-weight: 800;
        }

        .response-content table .highlight {
          background-color: #fef3c7;
          font-weight: 600;
        }

        .response-content table .success {
          background-color: #d1fae5;
          color: #065f46;
        }

        .response-content table .warning {
          background-color: #fef3c7;
          color: #92400e;
        }

        .response-content table .error {
          background-color: #fee2e2;
          color: #991b1b;
        }

        /* Responsive Table Design */
        @media (max-width: 768px) {
          .response-content table {
            font-size: 0.75rem;
            display: block;
            overflow-x: auto;
            white-space: nowrap;
          }

          .response-content table th,
          .response-content table td {
            padding: 0.5rem 0.75rem;
            min-width: 100px;
          }

          .response-content table caption {
            padding: 0.75rem;
            font-size: 1rem;
          }
        }

        /* Table Borders and Shadows */
        .response-content table {
          border: 2px solid #e5e7eb;
        }

        .response-content table thead {
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .response-content table tbody {
          background-color: white;
        }

        /* Animation for table appearance */
        .response-content table {
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Print Styles */
        @media print {
          .response-content {
            font-size: 12pt;
            line-height: 1.5;
          }

          .response-content h1 {
            font-size: 18pt;
            page-break-after: avoid;
          }

          .response-content h2 {
            font-size: 16pt;
            page-break-after: avoid;
          }

          .response-content h3 {
            font-size: 14pt;
            page-break-after: avoid;
          }

          .response-content table {
            page-break-inside: avoid;
          }

          .response-content .source-section,
          .response-content .chapter-section {
            page-break-inside: avoid;
          }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .response-content table {
            font-size: 0.875rem;
          }

          .response-content table th,
          .response-content table td {
            padding: 0.5rem;
          }

          .response-content h1 {
            font-size: 1.75rem;
          }

          .response-content h2 {
            font-size: 1.375rem;
          }
        }
      `}</style>
    </div>
  );
}