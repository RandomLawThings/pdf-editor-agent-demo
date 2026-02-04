/**
 * PDF Tools as MCP Server for Claude Agent SDK
 * Based on the manus-hackathon legal-pdf-tools implementation
 */

import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { fromPath } from 'pdf2pic';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import { storagePut, storageGet, UPLOADS_DIR } from '../storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { buildSessionScopedKey } from '../_core/session';

// Types for tool inputs
export interface SplitPdfInput {
  documentId: string;
  pageRanges: Array<{ start: number; end: number; filename?: string; outputName?: string }>;
}

export interface CombinePdfsInput {
  documentIds: string[];
  outputFilename?: string;
  outputName?: string;
}

export interface MovePagesInput {
  documentId: string;
  pageOrder: number[];
  outputFilename?: string;
  outputName?: string;
}

export interface AddWatermarkInput {
  documentId: string;
  text: string;
  opacity?: number;
  angle?: number;
}

export interface AddPageNumbersInput {
  documentId: string;
  format?: string;
  position?: string;
  startPage?: number;
  startNumber?: number;
}

export interface ExtractTextInput {
  documentId: string;
  pages?: number[];
}

export interface CheckMarginsInput {
  documentId: string;
  marginInches?: number;
  marginSize?: number;
}

export interface FindWhitespaceInput {
  documentId: string;
  minWidthInches?: number;
  minHeightInches?: number;
  minWidth?: number;
  minHeight?: number;
  page?: number;
  pageNumber?: number;
  prefer?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom' | 'top' | 'any';
}

export interface PrepareStampInput {
  text: string;
  fontSize?: number;
  borderWidth?: number;
  padding?: number;
  fontName?: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Courier';
  includeDate?: boolean;
  dateFormat?: string;
}

export interface AddStampInput {
  documentId: string;
  text: string;
  page?: number;
  pageNumber?: number;
  x?: number;
  y?: number;
  xInches?: number;
  yInches?: number;
  fontSize?: number;
  borderWidth?: number;
  padding?: number;
  opacity?: number;
  rotation?: number;
  color?: { r: number; g: number; b: number };
  backgroundColor?: { r: number; g: number; b: number } | null;
  includeDate?: boolean;
  autoPosition?: boolean;
  preferPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

// Helper to download PDF from storage (local or remote)
async function downloadPdfFromS3(documentId: string, documents: any[]): Promise<Buffer> {
  const doc = documents.find(d => d.id === documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found. Available documents: ${documents.map(d => d.id).join(', ')}`);
  }

  if (!doc.url) {
    throw new Error(`Document ${documentId} has no URL`);
  }

  // If URL is a local path (starts with /uploads/), read from UPLOADS_DIR
  if (doc.url.startsWith('/uploads/')) {
    // Extract the path after /uploads/
    const relativePath = doc.url.replace('/uploads/', '');
    const localPath = path.join(UPLOADS_DIR, relativePath);
    return await fs.readFile(localPath);
  }

  // Otherwise fetch from remote URL
  const response = await axios.get(doc.url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

// Helper to upload result to storage (session-scoped)
// The userId parameter is actually the sessionId for session isolation
async function uploadResultToS3(buffer: Buffer, filename: string, sessionId: string): Promise<{ key: string; url: string }> {
  // Use session-scoped storage path
  const fileKey = buildSessionScopedKey(sessionId, `${filename}-${randomBytes(4).toString('hex')}.pdf`);
  return await storagePut(fileKey, buffer, 'application/pdf');
}

/**
 * Estimate stamp dimensions based on text and styling
 */
function estimateStampSize(
  text: string,
  fontSize: number = 14,
  padding: number = 10,
  borderWidth: number = 2,
  includeDate: boolean = false
): { widthInches: number; heightInches: number; widthPoints: number; heightPoints: number } {
  // Approximate character width for Helvetica (varies by character)
  const avgCharWidth = fontSize * 0.5;
  
  // Calculate text width
  const lines = text.split('\n');
  let maxLineWidth = 0;
  for (const line of lines) {
    const lineWidth = line.length * avgCharWidth;
    if (lineWidth > maxLineWidth) {
      maxLineWidth = lineWidth;
    }
  }
  
  // Add date line if included
  let totalLines = lines.length;
  if (includeDate) {
    totalLines += 1;
    const dateText = new Date().toLocaleDateString();
    const dateWidth = dateText.length * avgCharWidth;
    if (dateWidth > maxLineWidth) {
      maxLineWidth = dateWidth;
    }
  }
  
  // Calculate dimensions with padding and border
  const widthPoints = maxLineWidth + (padding * 2) + (borderWidth * 2);
  const heightPoints = (totalLines * fontSize * 1.2) + (padding * 2) + (borderWidth * 2);
  
  return {
    widthPoints,
    heightPoints,
    widthInches: widthPoints / 72,
    heightInches: heightPoints / 72
  };
}

/**
 * PDF MCP Tools - These match the legal-pdf-tools from manus-hackathon
 */
export const pdfMcpTools = {
  /**
   * Split a PDF into multiple files by page ranges
   */
  split_pdf: async (input: SplitPdfInput, context: { documents: any[]; userId: string }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const results: Array<{ id: string; filename: string; url: string; pages: string }> = [];

    for (const range of input.pageRanges) {
      const newPdf = await PDFDocument.create();
      const pages = await newPdf.copyPages(pdfDoc, Array.from(
        { length: range.end - range.start + 1 },
        (_, i) => range.start - 1 + i
      ));
      pages.forEach(page => newPdf.addPage(page));

      const filename = range.filename || range.outputName || `split_${range.start}-${range.end}`;
      const newPdfBytes = await newPdf.save();
      const result = await uploadResultToS3(Buffer.from(newPdfBytes), filename, context.userId);

      // Generate document ID here so agent can use it immediately
      const docId = randomBytes(8).toString('hex');

      results.push({
        id: docId,
        filename,
        url: result.url,
        pages: `${range.start}-${range.end}`
      });
    }

    return {
      success: true,
      message: `Split PDF into ${results.length} files. Document IDs: ${results.map(r => r.id).join(', ')}`,
      files: results
    };
  },

  /**
   * Combine multiple PDFs into one
   */
  combine_pdfs: async (input: CombinePdfsInput, context: { documents: any[]; userId: string }) => {
    const mergedPdf = await PDFDocument.create();

    for (const docId of input.documentIds) {
      const pdfBuffer = await downloadPdfFromS3(docId, context.documents);
      const pdf = await PDFDocument.load(pdfBuffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const filename = input.outputFilename || input.outputName || 'combined';
    const mergedBytes = await mergedPdf.save();
    const result = await uploadResultToS3(Buffer.from(mergedBytes), filename, context.userId);

    // Generate document ID here so agent can use it immediately
    const docId = randomBytes(8).toString('hex');

    return {
      success: true,
      message: `Combined ${input.documentIds.length} PDFs. New document ID: ${docId}`,
      id: docId,
      url: result.url,
      filename
    };
  },

  /**
   * Reorder pages in a PDF
   */
  move_pages: async (input: MovePagesInput, context: { documents: any[]; userId: string }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const newPdf = await PDFDocument.create();

    const pages = await newPdf.copyPages(pdfDoc, input.pageOrder.map(n => n - 1));
    pages.forEach(page => newPdf.addPage(page));

    const filename = input.outputFilename || input.outputName || 'reordered';
    const newPdfBytes = await newPdf.save();
    const result = await uploadResultToS3(Buffer.from(newPdfBytes), filename, context.userId);

    const docId = randomBytes(8).toString('hex');

    return {
      success: true,
      message: `Reordered ${input.pageOrder.length} pages. New document ID: ${docId}`,
      id: docId,
      url: result.url,
      filename
    };
  },

  /**
   * Add text watermark to PDF
   */
  add_watermark: async (input: AddWatermarkInput, context: { documents: any[]; userId: string }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const pages = pdfDoc.getPages();
    const opacity = input.opacity || 0.3;
    
    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(input.text, {
        x: width / 2 - (input.text.length * 10),
        y: height / 2,
        size: 60,
        opacity: opacity,
      });
    }
    
    const watermarkedBytes = await pdfDoc.save();
    const filename = `${input.documentId}_watermarked`;
    const result = await uploadResultToS3(Buffer.from(watermarkedBytes), filename, context.userId);

    const docId = randomBytes(8).toString('hex');

    return {
      success: true,
      message: `Added watermark "${input.text}". New document ID: ${docId}`,
      id: docId,
      url: result.url,
      filename
    };
  },

  /**
   * Add page numbers to PDF
   */
  add_page_numbers: async (input: AddPageNumbersInput, context: { documents: any[]; userId: string }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const pages = pdfDoc.getPages();
    const format = input.format || 'Page {n} of {total}';
    const startPage = input.startPage || input.startNumber || 1;
    
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      const pageNum = startPage + index;
      const text = format.replace('{n}', pageNum.toString()).replace('{total}', pages.length.toString());
      
      const position = input.position || 'bottom-center';
      let x = width / 2 - (text.length * 3);
      let y = 20;
      
      if (position.includes('top')) y = height - 30;
      if (position.includes('left')) x = 30;
      if (position.includes('right')) x = width - 100;
      
      page.drawText(text, { x, y, size: 10 });
    });
    
    const numberedBytes = await pdfDoc.save();
    const filename = `${input.documentId}_numbered`;
    const result = await uploadResultToS3(Buffer.from(numberedBytes), filename, context.userId);

    const docId = randomBytes(8).toString('hex');

    return {
      success: true,
      message: `Added page numbers to ${pages.length} pages. New document ID: ${docId}`,
      id: docId,
      url: result.url,
      filename
    };
  },

  /**
   * Extract text from PDF
   */
  extract_text: async (input: ExtractTextInput, context: { documents: any[] }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);

    try {
      // Use PDFParse with the buffer as LoadParameters (dynamic import for Vercel compatibility)
      const parser = new PDFParse({ data: pdfBuffer });
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();
      
      return {
        success: true,
        totalPages: infoResult.total || 0,
        text: textResult.text || '',
        info: infoResult.info || {}
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to extract text: ${error.message}`
      };
    }
  },

  /**
   * Check PDF margins for content that might be cut off
   */
  check_margins: async (input: CheckMarginsInput, context: { documents: any[] }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const marginInches = input.marginInches || (input.marginSize ? input.marginSize / 72 : 1.0);
    const dpi = 150;
    const marginPixels = marginInches * dpi;
    
    const results: Array<{ page: number; hasContentInMargin: boolean; details: string }> = [];
    
    // Convert pages to images and check margins
    const tempDir = `/tmp/pdf-margin-check-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      const converter = fromPath(tempDir + '/temp.pdf', {
        density: dpi,
        saveFilename: 'page',
        savePath: tempDir,
        format: 'png'
      });

      await fs.writeFile(tempDir + '/temp.pdf', pdfBuffer);

      for (let i = 1; i <= pdfDoc.getPageCount(); i++) {
        await converter(i);
        const imagePath = path.join(tempDir, `page.${i}.png`);

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        
        if (!metadata.width || !metadata.height) continue;
        
        // Check if there's content in margin areas
        const topMargin = await image.clone().extract({
          left: 0,
          top: 0,
          width: metadata.width,
          height: Math.floor(marginPixels)
        }).stats();
        
        const hasContent = topMargin.channels.some(c => c.mean < 250);
        
        results.push({
          page: i,
          hasContentInMargin: hasContent,
          details: hasContent ? 'Content detected in margin area' : 'Margins clear'
        });
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    
    return {
      success: true,
      marginInches,
      results,
      hasIssues: results.some(r => r.hasContentInMargin)
    };
  },

  /**
   * Find clear whitespace regions for stamps/signatures using image analysis
   */
  find_whitespace: async (input: FindWhitespaceInput, context: { documents: any[] }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const minWidthInches = input.minWidthInches || (input.minWidth ? input.minWidth / 72 : 1.5);
    const minHeightInches = input.minHeightInches || (input.minHeight ? input.minHeight / 72 : 0.5);
    const dpi = 150;
    const minWidthPx = Math.floor(minWidthInches * dpi);
    const minHeightPx = Math.floor(minHeightInches * dpi);
    const threshold = 250; // Pixels brighter than this are whitespace
    
    const pageToCheck = input.page || input.pageNumber || 1;
    const prefer = input.prefer || 'bottom-right';
    
    // Get page dimensions
    const page = pdfDoc.getPage(pageToCheck - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Convert page to image for analysis
    const tempDir = `/tmp/pdf-whitespace-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      await fs.writeFile(tempDir + '/temp.pdf', pdfBuffer);

      const converter = fromPath(tempDir + '/temp.pdf', {
        density: dpi,
        saveFilename: 'page',
        savePath: tempDir,
        format: 'png'
      });

      await converter(pageToCheck);
      const imagePath = path.join(tempDir, `page.${pageToCheck}.png`);

      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Could not read image dimensions');
      }
      
      // Get raw pixel data
      const { data, info } = await image.grayscale().raw().toBuffer({ resolveWithObject: true });
      const width = info.width;
      const height = info.height;
      
      // Build integral image for efficient whitespace queries
      const integral: number[][] = Array(height + 1).fill(null).map(() => Array(width + 1).fill(0));
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const isWhite = data[y * width + x] >= threshold ? 1 : 0;
          integral[y + 1][x + 1] = isWhite + integral[y][x + 1] + integral[y + 1][x] - integral[y][x];
        }
      }
      
      // Function to check if a region is clear
      const regionIsClear = (x1: number, y1: number, x2: number, y2: number): boolean => {
        const total = integral[y2][x2] - integral[y1][x2] - integral[y2][x1] + integral[y1][x1];
        const expected = (x2 - x1) * (y2 - y1);
        return total === expected;
      };
      
      // Find whitespace candidates
      const candidates: Array<{ x: number; y: number; score: number }> = [];
      const stepX = Math.max(1, Math.floor(minWidthPx / 4));
      const stepY = Math.max(1, Math.floor(minHeightPx / 4));
      
      // Define margin area to stay within (0.5 inch from edges)
      const marginPx = Math.floor(0.5 * dpi);
      
      for (let y = marginPx; y <= height - minHeightPx - marginPx; y += stepY) {
        for (let x = marginPx; x <= width - minWidthPx - marginPx; x += stepX) {
          if (regionIsClear(x, y, x + minWidthPx, y + minHeightPx)) {
            // Score based on preference
            const nx = x / Math.max(1, width - minWidthPx);
            const ny = y / Math.max(1, height - minHeightPx);
            
            let score = 0;
            switch (prefer) {
              case 'bottom-right':
                score = nx + ny;
                break;
              case 'bottom-left':
                score = (1 - nx) + ny;
                break;
              case 'top-right':
                score = nx + (1 - ny);
                break;
              case 'top-left':
                score = (1 - nx) + (1 - ny);
                break;
              case 'bottom':
                score = ny;
                break;
              case 'top':
                score = 1 - ny;
                break;
              default:
                score = 0;
            }
            
            candidates.push({ x, y, score });
          }
        }
      }
      
      // Sort by score (higher is better for preferred position)
      candidates.sort((a, b) => b.score - a.score);
      
      // Take top 5 candidates
      const regions = candidates.slice(0, 5).map((c, i) => ({
        rank: i + 1,
        // Convert from image coordinates (top-left origin) to PDF coordinates (bottom-left origin)
        xInches: c.x / dpi,
        yInches: (height - c.y - minHeightPx) / dpi, // Flip Y for PDF coordinates
        xPoints: (c.x / dpi) * 72,
        yPoints: ((height - c.y - minHeightPx) / dpi) * 72,
        widthInches: minWidthInches,
        heightInches: minHeightInches
      }));
      
      return {
        success: true,
        page: pageToCheck,
        pageWidthInches: pageWidth / 72,
        pageHeightInches: pageHeight / 72,
        searchedFor: {
          minWidthInches,
          minHeightInches,
          prefer
        },
        found: regions.length > 0,
        candidatesFound: candidates.length,
        regions,
        message: regions.length > 0 
          ? `Found ${regions.length} suitable whitespace region(s) on page ${pageToCheck}`
          : `No whitespace regions of ${minWidthInches}"x${minHeightInches}" found on page ${pageToCheck}`
      };
      
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },

  /**
   * Prepare stamp - estimate size needed for a stamp with given text
   * Use this BEFORE find_whitespace to know what size to search for
   */
  prepare_stamp: async (input: PrepareStampInput) => {
    const fontSize = input.fontSize || 14;
    const borderWidth = input.borderWidth || 2;
    const padding = input.padding || 10;
    const includeDate = input.includeDate ?? true;
    
    // Build the full stamp text
    let fullText = input.text;
    if (includeDate) {
      const dateStr = input.dateFormat 
        ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : new Date().toLocaleDateString();
      fullText += `\n${dateStr}`;
    }
    
    const size = estimateStampSize(fullText, fontSize, padding, borderWidth, false);
    
    return {
      success: true,
      stampText: fullText,
      estimatedSize: {
        widthInches: Math.round(size.widthInches * 100) / 100,
        heightInches: Math.round(size.heightInches * 100) / 100,
        widthPoints: Math.round(size.widthPoints),
        heightPoints: Math.round(size.heightPoints)
      },
      styling: {
        fontSize,
        borderWidth,
        padding,
        includeDate
      },
      recommendation: `Use find_whitespace with minWidthInches=${Math.ceil(size.widthInches * 10) / 10} and minHeightInches=${Math.ceil(size.heightInches * 10) / 10} to find a suitable location`
    };
  },

  /**
   * Add a positioned stamp to a PDF page
   * Can auto-position using find_whitespace or use explicit coordinates
   */
  add_stamp: async (input: AddStampInput, context: { documents: any[]; userId: string }) => {
    const pdfBuffer = await downloadPdfFromS3(input.documentId, context.documents);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const pageNum = input.page || input.pageNumber || 1;
    const page = pdfDoc.getPage(pageNum - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Stamp styling
    const fontSize = input.fontSize || 14;
    const borderWidth = input.borderWidth || 2;
    const padding = input.padding || 10;
    const opacity = input.opacity || 1.0;
    const rotation = input.rotation || 0;
    const color = input.color || { r: 0, g: 0, b: 0 };
    const backgroundColor = input.backgroundColor; // null for transparent
    const includeDate = input.includeDate ?? true;
    
    // Build stamp text
    let stampText = input.text;
    if (includeDate) {
      const dateStr = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      stampText += `\n${dateStr}`;
    }
    
    // Estimate stamp size
    const size = estimateStampSize(stampText, fontSize, padding, borderWidth, false);
    
    // Determine position
    let x: number, y: number;
    
    if (input.autoPosition !== false && !input.x && !input.xInches) {
      // Auto-position: find whitespace
      const whitespaceResult = await pdfMcpTools.find_whitespace({
        documentId: input.documentId,
        minWidthInches: size.widthInches + 0.1,
        minHeightInches: size.heightInches + 0.1,
        page: pageNum,
        prefer: input.preferPosition || 'top-right'
      }, context);
      
      if (whitespaceResult.regions && whitespaceResult.regions.length > 0) {
        const region = whitespaceResult.regions[0];
        x = region.xPoints;
        y = region.yPoints;
      } else {
        // Fallback to preferred corner with margin
        const margin = 36; // 0.5 inch
        const prefer = input.preferPosition || 'top-right';
        
        if (prefer.includes('right')) {
          x = pageWidth - size.widthPoints - margin;
        } else {
          x = margin;
        }
        
        if (prefer.includes('top')) {
          y = pageHeight - size.heightPoints - margin;
        } else {
          y = margin;
        }
      }
    } else {
      // Use explicit coordinates
      x = input.x || (input.xInches ? input.xInches * 72 : 72);
      y = input.y || (input.yInches ? input.yInches * 72 : pageHeight - size.heightPoints - 72);
    }
    
    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Draw background if specified
    if (backgroundColor) {
      page.drawRectangle({
        x,
        y,
        width: size.widthPoints,
        height: size.heightPoints,
        color: rgb(backgroundColor.r / 255, backgroundColor.g / 255, backgroundColor.b / 255),
        opacity
      });
    }
    
    // Draw border
    page.drawRectangle({
      x,
      y,
      width: size.widthPoints,
      height: size.heightPoints,
      borderColor: rgb(color.r / 255, color.g / 255, color.b / 255),
      borderWidth,
      opacity
    });
    
    // Draw text lines
    const lines = stampText.split('\n');
    const lineHeight = fontSize * 1.2;
    let textY = y + size.heightPoints - padding - fontSize;
    
    for (const line of lines) {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      const textX = x + (size.widthPoints - textWidth) / 2; // Center text
      
      page.drawText(line, {
        x: textX,
        y: textY,
        size: fontSize,
        font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
        opacity,
        rotate: degrees(rotation)
      });
      
      textY -= lineHeight;
    }
    
    // Save and upload
    const stampedBytes = await pdfDoc.save();
    const filename = `${input.documentId}_stamped`;
    const result = await uploadResultToS3(Buffer.from(stampedBytes), filename, context.userId);

    const docId = randomBytes(8).toString('hex');

    return {
      success: true,
      message: `Added stamp "${input.text}" to page ${pageNum}. New document ID: ${docId}`,
      id: docId,
      url: result.url,
      filename,
      stampPosition: {
        page: pageNum,
        xInches: x / 72,
        yInches: y / 72,
        widthInches: size.widthInches,
        heightInches: size.heightInches
      }
    };
  },

  /**
   * Clear all revised documents - this is a special tool that signals
   * the router to clear revised documents. The actual clearing happens
   * in the router after this tool returns.
   */
  clear_revised_documents: async (_input: {}, context: { documents: any[]; userId: string; clearRevisedCallback?: () => Promise<{ deletedCount: number }> }) => {
    // Count current revised documents
    const revisedDocs = context.documents.filter(d => d.type === 'revised');
    
    // If a callback is provided, use it to actually clear the documents
    if (context.clearRevisedCallback) {
      const result = await context.clearRevisedCallback();
      return {
        success: true,
        message: `Cleared ${result.deletedCount} revised document(s)`,
        deletedCount: result.deletedCount
      };
    }
    
    // Otherwise just return info about what would be cleared
    return {
      success: true,
      message: `Would clear ${revisedDocs.length} revised document(s)`,
      revisedDocumentCount: revisedDocs.length,
      needsCallback: true
    };
  },

  /**
   * Delete specific revised documents by ID
   */
  delete_documents: async (
    input: { documentIds: string[] },
    context: {
      documents: any[];
      userId: string;
      deleteDocumentsCallback?: (ids: string[]) => Promise<{ deletedCount: number; skippedOriginals: number }>
    }
  ) => {
    // Filter to only revised documents
    const revisedIds = input.documentIds.filter(id => {
      const doc = context.documents.find(d => d.id === id);
      return doc && doc.type === 'revised';
    });

    const originalIds = input.documentIds.filter(id => {
      const doc = context.documents.find(d => d.id === id);
      return doc && doc.type === 'original';
    });

    if (context.deleteDocumentsCallback) {
      const result = await context.deleteDocumentsCallback(revisedIds);
      return {
        success: true,
        message: `Deleted ${result.deletedCount} revised document(s)${result.skippedOriginals > 0 ? `. Skipped ${result.skippedOriginals} original document(s) (cannot delete originals).` : ''}`,
        deletedCount: result.deletedCount,
        skippedOriginals: result.skippedOriginals
      };
    }

    return {
      success: true,
      message: `Would delete ${revisedIds.length} revised document(s)${originalIds.length > 0 ? `. Would skip ${originalIds.length} original document(s).` : ''}`,
      revisedToDelete: revisedIds.length,
      originalsSkipped: originalIds.length,
      needsCallback: true
    };
  }
};
