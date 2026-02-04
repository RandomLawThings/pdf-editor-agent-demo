import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * PDF Operations Service
 * Implements core PDF manipulation functions matching the Python legal-pdf-tools
 */

export interface CombinePDFsOptions {
  paths: string[];
  output: string;
}

export interface SplitPDFOptions {
  path: string;
  pageRanges: Array<{
    start: number;
    end: number;
    filename: string;
  }>;
  outputDir: string;
}

export interface MovePagesOptions {
  path: string;
  pageOrder: number[];
  output: string;
}

export interface ExtractTextOptions {
  path: string;
  pages?: number[];
}

export interface AddWatermarkOptions {
  path: string;
  text: string;
  output: string;
  opacity?: number;
  fontSize?: number;
  rotation?: number;
}

export interface AddPageNumbersOptions {
  path: string;
  output: string;
  position?: "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "top-left" | "top-right";
  startNumber?: number;
  fontSize?: number;
}

/**
 * Combine multiple PDFs into a single file
 * Matches: combine_pdfs from Python implementation
 */
export async function combinePDFs(options: CombinePDFsOptions): Promise<string> {
  const { paths, output } = options;

  const mergedPdf = await PDFDocument.create();

  for (const pdfPath of paths) {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(output, mergedPdfBytes);

  return path.resolve(output);
}

/**
 * Split a PDF into multiple files by page ranges
 * Matches: split_pdf from Python implementation
 */
export async function splitPDF(options: SplitPDFOptions): Promise<string[]> {
  const { path: pdfPath, pageRanges, outputDir } = options;

  const pdfBytes = await fs.readFile(pdfPath);
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const totalPages = sourcePdf.getPageCount();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const createdFiles: string[] = [];

  for (const range of pageRanges) {
    const { start, end, filename } = range;

    // Validate range (1-indexed, inclusive)
    if (start < 1) {
      throw new Error(`Invalid start page ${start}: must be >= 1`);
    }
    if (end < start) {
      throw new Error(`Invalid range: end (${end}) < start (${start})`);
    }
    if (start > totalPages) {
      throw new Error(
        `Start page ${start} exceeds document length (${totalPages} pages)`
      );
    }

    // Clamp end to document length
    const actualEnd = Math.min(end, totalPages);

    // Create new PDF with specified pages
    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from(
      { length: actualEnd - start + 1 },
      (_, i) => start - 1 + i
    );
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const newPdfBytes = await newPdf.save();
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, newPdfBytes);

    createdFiles.push(path.resolve(outputPath));
  }

  return createdFiles;
}

/**
 * Reorder pages in a PDF
 * Matches: move_pages from Python implementation
 */
export async function movePages(options: MovePagesOptions): Promise<string> {
  const { path: pdfPath, pageOrder, output } = options;

  const pdfBytes = await fs.readFile(pdfPath);
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const totalPages = sourcePdf.getPageCount();

  const newPdf = await PDFDocument.create();

  // Convert 1-indexed to 0-indexed and validate
  const validPageIndices = pageOrder
    .map((pageNum) => pageNum - 1)
    .filter((idx) => idx >= 0 && idx < totalPages);

  const copiedPages = await newPdf.copyPages(sourcePdf, validPageIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));

  const newPdfBytes = await newPdf.save();
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(output, newPdfBytes);

  return path.resolve(output);
}

/**
 * Extract text from PDF pages
 * Matches: extract_text from Python implementation
 */
export async function extractText(options: ExtractTextOptions): Promise<{
  totalPages: number;
  pages: Array<{ pageNumber: number; text: string }>;
}> {
  const { path: pdfPath, pages: pageNumbers } = options;

  // Note: pdf-lib doesn't have built-in text extraction
  // We'll use pdf-parse for this
  const pdfParse = require("pdf-parse");
  const pdfBytes = await fs.readFile(pdfPath);
  const data = await pdfParse(pdfBytes);

  const totalPages = data.numpages;
  const results: Array<{ pageNumber: number; text: string }> = [];

  // pdf-parse extracts all text at once, so we return it as a single result
  // For page-specific extraction, we'd need a different library
  if (pageNumbers && pageNumbers.length > 0) {
    // Return only requested pages (simplified - returns full text)
    pageNumbers.forEach((pageNum) => {
      if (pageNum >= 1 && pageNum <= totalPages) {
        results.push({
          pageNumber: pageNum,
          text: data.text, // Note: This is simplified - full text for now
        });
      }
    });
  } else {
    // Return all pages
    results.push({
      pageNumber: 1,
      text: data.text,
    });
  }

  return {
    totalPages,
    pages: results,
  };
}

/**
 * Add watermark to PDF pages
 */
export async function addWatermark(options: AddWatermarkOptions): Promise<string> {
  const { path: pdfPath, text, output, opacity = 0.3, fontSize = 48 } = options;

  const pdfBytes = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Center the watermark
    const x = (width - textWidth) / 2;
    const y = (height - textHeight) / 2;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
    });
  }

  const watermarkedPdfBytes = await pdfDoc.save();
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(output, watermarkedPdfBytes);

  return path.resolve(output);
}

/**
 * Add page numbers to PDF
 */
export async function addPageNumbers(options: AddPageNumbersOptions): Promise<string> {
  const {
    path: pdfPath,
    output,
    position = "bottom-center",
    startNumber = 1,
    fontSize = 10,
  } = options;

  const pdfBytes = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    const pageNumber = (startNumber + index).toString();
    const textWidth = font.widthOfTextAtSize(pageNumber, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    let x: number;
    let y: number;

    // Calculate position based on option
    switch (position) {
      case "bottom-center":
        x = (width - textWidth) / 2;
        y = 30;
        break;
      case "bottom-left":
        x = 40;
        y = 30;
        break;
      case "bottom-right":
        x = width - textWidth - 40;
        y = 30;
        break;
      case "top-center":
        x = (width - textWidth) / 2;
        y = height - textHeight - 30;
        break;
      case "top-left":
        x = 40;
        y = height - textHeight - 30;
        break;
      case "top-right":
        x = width - textWidth - 40;
        y = height - textHeight - 30;
        break;
    }

    page.drawText(pageNumber, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });

  const numberedPdfBytes = await pdfDoc.save();
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(output, numberedPdfBytes);

  return path.resolve(output);
}
