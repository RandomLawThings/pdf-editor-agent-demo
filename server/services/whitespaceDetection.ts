import { fromPath } from "pdf2pic";
import sharp from "sharp";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Whitespace Detection Service
 * Implements whitespace analysis functions matching the Python legal-pdf-tools
 */

export interface MarginCheckResult {
  path: string;
  marginCheckedInches: number;
  totalPages: number;
  pagesWithMarginIssues: number;
  pages: Array<{
    page: number;
    hasContentInMargins: boolean;
    marginIssues: {
      top: boolean;
      bottom: boolean;
      left: boolean;
      right: boolean;
    };
  }>;
  hasIssues: boolean;
}

export interface PageNumberCheckResult {
  path: string;
  totalPages: number;
  positionPercentages: Record<string, number>;
  overallClearPercentage: number;
  pages: Array<{
    page: number;
    positions: Record<string, boolean>;
    clearCount: number;
    allClear: boolean;
  }>;
}

export interface WhitespaceRegion {
  xInches: number;
  yInches: number;
  widthInches: number;
  heightInches: number;
}

export interface FindWhitespaceResult {
  path: string;
  minWidthInches: number;
  minHeightInches: number;
  prefer: string;
  totalPagesSearched: number;
  pagesWithWhitespace: number;
  found: boolean;
  pages: Array<{
    page: number;
    found: boolean;
    region?: WhitespaceRegion;
    candidatesFound: number;
  }>;
}

/**
 * Check PDF margins for content that might be cut off during printing
 * Matches: check_margin_whitespace from Python implementation
 */
export async function checkMarginWhitespace(
  pdfPath: string,
  marginInches: number = 1.0,
  dpi: number = 72,
  threshold: number = 250
): Promise<MarginCheckResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-margins-"));

  try {
    // Convert PDF to images
    const converter = fromPath(pdfPath, {
      density: dpi,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 600,
      height: 800,
    });

    // Get total pages
    const pdfLib = await import("pdf-lib");
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    const results: MarginCheckResult["pages"] = [];
    const marginPixels = Math.floor(marginInches * dpi);

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Convert page to image
      const imagePath = path.join(tempDir, `page.${pageNum}.png`);
      await converter(pageNum, { responseType: "image" });

      // Load image with sharp
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      const { width = 0, height = 0 } = metadata;

      // Get raw pixel data
      const { data } = await image.raw().toBuffer({ resolveWithObject: true });

      // Check each margin area
      const marginIssues = {
        top: false,
        bottom: false,
        left: false,
        right: false,
      };

      // Check top margin
      for (let y = 0; y < Math.min(marginPixels, height); y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3; // RGB
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness < threshold) {
            marginIssues.top = true;
            break;
          }
        }
        if (marginIssues.top) break;
      }

      // Check bottom margin
      for (let y = Math.max(0, height - marginPixels); y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness < threshold) {
            marginIssues.bottom = true;
            break;
          }
        }
        if (marginIssues.bottom) break;
      }

      // Check left margin
      for (let x = 0; x < Math.min(marginPixels, width); x++) {
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 3;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness < threshold) {
            marginIssues.left = true;
            break;
          }
        }
        if (marginIssues.left) break;
      }

      // Check right margin
      for (let x = Math.max(0, width - marginPixels); x < width; x++) {
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 3;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness < threshold) {
            marginIssues.right = true;
            break;
          }
        }
        if (marginIssues.right) break;
      }

      const hasContentInMargins = Object.values(marginIssues).some((v) => v);
      results.push({
        page: pageNum,
        hasContentInMargins,
        marginIssues,
      });
    }

    const pagesWithIssues = results.filter((r) => r.hasContentInMargins);

    return {
      path: path.resolve(pdfPath),
      marginCheckedInches: marginInches,
      totalPages,
      pagesWithMarginIssues: pagesWithIssues.length,
      pages: results,
      hasIssues: pagesWithIssues.length > 0,
    };
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Check if page number positions are clear on specified pages
 * Matches: check_page_number_whitespace from Python implementation
 */
export async function checkPageNumberWhitespace(
  pdfPath: string,
  pages?: number[],
  dpi: number = 72,
  threshold: number = 250
): Promise<PageNumberCheckResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-pagenums-"));

  try {
    // Convert PDF to images
    const converter = fromPath(pdfPath, {
      density: dpi,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 600,
      height: 800,
    });

    // Get total pages
    const pdfLib = await import("pdf-lib");
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Page number check box dimensions (in inches)
    const boxWidthInches = 0.75;
    const boxHeightInches = 0.25;

    // Vertical positions (from page edge, in inches)
    const topYInches = 0.35;
    const bottomYOffsetInches = 0.35;

    // Horizontal positions
    const leftXInches = 0.4;

    const boxWPx = Math.floor(boxWidthInches * dpi);
    const boxHPx = Math.floor(boxHeightInches * dpi);

    const pagesToCheck = pages || Array.from({ length: totalPages }, (_, i) => i + 1);
    const results: PageNumberCheckResult["pages"] = [];
    let totalClear = 0;
    let totalChecked = 0;

    for (const pageNum of pagesToCheck) {
      if (pageNum < 1 || pageNum > totalPages) continue;

      // Convert page to image
      const imagePath = path.join(tempDir, `page.${pageNum}.png`);
      await converter(pageNum, { responseType: "image" });

      // Load image with sharp
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      const { width = 0, height = 0 } = metadata;

      // Get raw pixel data
      const { data } = await image.raw().toBuffer({ resolveWithObject: true });

      // Calculate positions in pixels
      const topY = Math.floor(topYInches * dpi);
      const bottomY = height - Math.floor(bottomYOffsetInches * dpi) - boxHPx;
      const leftX = Math.floor(leftXInches * dpi);
      const centerX = Math.floor((width - boxWPx) / 2);
      const rightX = width - Math.floor(leftXInches * dpi) - boxWPx;

      const positions: Record<string, [number, number]> = {
        "top-left": [leftX, topY],
        "top-center": [centerX, topY],
        "top-right": [rightX, topY],
        "bottom-left": [leftX, bottomY],
        "bottom-center": [centerX, bottomY],
        "bottom-right": [rightX, bottomY],
      };

      const isRegionClear = (x: number, y: number, w: number, h: number): boolean => {
        const x1 = Math.max(0, x);
        const y1 = Math.max(0, y);
        const x2 = Math.min(width, x + w);
        const y2 = Math.min(height, y + h);

        for (let py = y1; py < y2; py++) {
          for (let px = x1; px < x2; px++) {
            const idx = (py * width + px) * 3;
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            if (brightness < threshold) {
              return false;
            }
          }
        }
        return true;
      };

      const positionResults: Record<string, boolean> = {};
      for (const [posName, [x, y]] of Object.entries(positions)) {
        const isClear = isRegionClear(x, y, boxWPx, boxHPx);
        positionResults[posName] = isClear;
        totalChecked++;
        if (isClear) totalClear++;
      }

      const clearCount = Object.values(positionResults).filter((v) => v).length;
      results.push({
        page: pageNum,
        positions: positionResults,
        clearCount,
        allClear: clearCount === 6,
      });
    }

    // Calculate position percentages
    const positionNames = [
      "top-left",
      "top-center",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    const positionPercentages: Record<string, number> = {};
    for (const pos of positionNames) {
      const clearCount = results.filter((r) => r.positions[pos]).length;
      positionPercentages[pos] =
        results.length > 0 ? Math.round((clearCount / results.length) * 1000) / 10 : 0;
    }

    const overallPercentage = totalChecked > 0 ? (totalClear / totalChecked) * 100 : 0;

    return {
      path: path.resolve(pdfPath),
      totalPages: results.length,
      positionPercentages,
      overallClearPercentage: Math.round(overallPercentage * 10) / 10,
      pages: results,
    };
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Find a clear rectangular region in a PDF page suitable for stamps or signatures
 * Matches: find_whitespace from Python implementation
 */
export async function findWhitespace(
  pdfPath: string,
  minWidthInches: number = 1.0,
  minHeightInches?: number,
  page?: number,
  dpi: number = 72,
  threshold: number = 250,
  prefer: string = "bottom-right"
): Promise<FindWhitespaceResult> {
  const actualMinHeight = minHeightInches || minWidthInches;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-whitespace-"));

  try {
    // Convert PDF to images
    const converter = fromPath(pdfPath, {
      density: dpi,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 600,
      height: 800,
    });

    // Get total pages
    const pdfLib = await import("pdf-lib");
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    const minWidthPixels = Math.floor(minWidthInches * dpi);
    const minHeightPixels = Math.floor(actualMinHeight * dpi);

    const pagesToSearch = page ? [page] : Array.from({ length: totalPages }, (_, i) => i + 1);
    const results: FindWhitespaceResult["pages"] = [];

    for (const pageNum of pagesToSearch) {
      if (pageNum < 1 || pageNum > totalPages) {
        results.push({
          page: pageNum,
          found: false,
          candidatesFound: 0,
        });
        continue;
      }

      // Convert page to image
      const imagePath = path.join(tempDir, `page.${pageNum}.png`);
      await converter(pageNum, { responseType: "image" });

      // Load image with sharp
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      const { width = 0, height = 0 } = metadata;

      // Get raw pixel data (grayscale for efficiency)
      const { data } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });

      // Find whitespace regions using simplified scanning
      const candidates: WhitespaceRegion[] = [];
      const stepX = Math.max(1, Math.floor(minWidthPixels / 4));
      const stepY = Math.max(1, Math.floor(minHeightPixels / 4));

      for (let y = 0; y <= height - minHeightPixels; y += stepY) {
        for (let x = 0; x <= width - minWidthPixels; x += stepX) {
          // Check if this region is clear
          let isClear = true;
          outer: for (let py = y; py < y + minHeightPixels; py++) {
            for (let px = x; px < x + minWidthPixels; px++) {
              const idx = py * width + px;
              if (data[idx] < threshold) {
                isClear = false;
                break outer;
              }
            }
          }

          if (isClear) {
            candidates.push({
              xInches: x / dpi,
              yInches: y / dpi,
              widthInches: minWidthInches,
              heightInches: actualMinHeight,
            });
          }
        }
      }

      if (candidates.length > 0) {
        // Score candidates based on preference
        const scoreCandidate = (c: WhitespaceRegion): number => {
          const x = c.xInches * dpi;
          const y = c.yInches * dpi;
          const nx = x / Math.max(1, width - minWidthPixels);
          const ny = y / Math.max(1, height - minHeightPixels);

          switch (prefer) {
            case "bottom-right":
              return nx + ny;
            case "bottom-left":
              return 1 - nx + ny;
            case "top-right":
              return nx + (1 - ny);
            case "top-left":
              return 1 - nx + (1 - ny);
            case "bottom":
              return ny;
            case "top":
              return 1 - ny;
            default:
              return 0;
          }
        };

        candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
        const best = candidates[0];

        results.push({
          page: pageNum,
          found: true,
          region: {
            xInches: Math.round(best.xInches * 100) / 100,
            yInches: Math.round(best.yInches * 100) / 100,
            widthInches: minWidthInches,
            heightInches: actualMinHeight,
          },
          candidatesFound: candidates.length,
        });
      } else {
        results.push({
          page: pageNum,
          found: false,
          candidatesFound: 0,
        });
      }
    }

    const pagesWithWhitespace = results.filter((r) => r.found);

    return {
      path: path.resolve(pdfPath),
      minWidthInches,
      minHeightInches: actualMinHeight,
      prefer,
      totalPagesSearched: results.length,
      pagesWithWhitespace: pagesWithWhitespace.length,
      found: pagesWithWhitespace.length > 0,
      pages: results,
    };
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
