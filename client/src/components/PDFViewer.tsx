import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileText, Maximize2 } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string | null;
  filename?: string;
}

export function PDFViewer({ url, filename }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container width for auto-fit
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Account for padding (16px on each side)
        setContainerWidth(containerRef.current.clientWidth - 32);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Calculate scale to fit width
  const fitToWidth = useCallback(() => {
    if (pageWidth > 0 && containerWidth > 0) {
      const newScale = containerWidth / pageWidth;
      setScale(Math.min(Math.max(newScale, 0.5), 2)); // Clamp between 0.5 and 2
    }
  }, [pageWidth, containerWidth]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF');
    setLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    // Get the original page width (at scale 1.0)
    const originalWidth = page.originalWidth || page.width;
    setPageWidth(originalWidth);
    
    // Auto-fit on first load
    if (containerWidth > 0 && originalWidth > 0) {
      const newScale = containerWidth / originalWidth;
      setScale(Math.min(Math.max(newScale, 0.5), 2));
    }
  }, [containerWidth]);

  const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale(prev => Math.min(prev + 0.1, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.3));

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm">Select a document to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar - increased height */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 min-h-[44px]">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[70px] text-center font-medium">
            {pageNumber} / {numPages || '?'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {filename && (
          <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={filename}>
            {filename}
          </span>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomOut}
            disabled={scale <= 0.3}
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[45px] text-center font-medium">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            disabled={scale >= 3}
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={fitToWidth}
            title="Fit to width"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div className="flex justify-center p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {error && (
            <div className="flex flex-col items-center justify-center py-8 text-destructive">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            error={null}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
              onLoadSuccess={onPageLoadSuccess}
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
