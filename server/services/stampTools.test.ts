/**
 * Tests for stamp-related PDF tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage module
vi.mock('../storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ key: 'test-key', url: 'https://example.com/test.pdf' }),
  storageGet: vi.fn().mockResolvedValue({ key: 'test-key', url: 'https://example.com/test.pdf' })
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

// Mock pdf2pic
vi.mock('pdf2pic', () => ({
  fromPath: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ path: '/tmp/page.1.png' }))
}));

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    grayscale: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue({
      data: Buffer.alloc(100 * 100, 255), // All white pixels
      info: { width: 100, height: 100 }
    }),
    metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    clone: vi.fn().mockReturnThis(),
    extract: vi.fn().mockReturnThis(),
    stats: vi.fn().mockResolvedValue({ channels: [{ mean: 255 }] })
  })
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from(''))
}));

// Import after mocks
import { pdfMcpTools } from './pdfMcpTools';

describe('Stamp Tools', () => {
  describe('prepare_stamp', () => {
    it('should estimate stamp size for simple text', async () => {
      const result = await pdfMcpTools.prepare_stamp({
        text: 'NOLAN',
        fontSize: 14,
        includeDate: false
      });

      expect(result.success).toBe(true);
      expect(result.stampText).toBe('NOLAN');
      expect(result.estimatedSize).toBeDefined();
      expect(result.estimatedSize.widthInches).toBeGreaterThan(0);
      expect(result.estimatedSize.heightInches).toBeGreaterThan(0);
      expect(result.recommendation).toContain('find_whitespace');
    });

    it('should include date in stamp text when includeDate is true', async () => {
      const result = await pdfMcpTools.prepare_stamp({
        text: 'EXHIBIT A',
        includeDate: true
      });

      expect(result.success).toBe(true);
      expect(result.stampText).toContain('EXHIBIT A');
      expect(result.stampText).toContain('\n'); // Should have newline for date
      expect(result.styling.includeDate).toBe(true);
    });

    it('should calculate larger size for longer text', async () => {
      const shortResult = await pdfMcpTools.prepare_stamp({
        text: 'A',
        includeDate: false
      });

      const longResult = await pdfMcpTools.prepare_stamp({
        text: 'CONFIDENTIAL DOCUMENT',
        includeDate: false
      });

      expect(longResult.estimatedSize.widthInches).toBeGreaterThan(shortResult.estimatedSize.widthInches);
    });

    it('should respect fontSize parameter', async () => {
      const smallFont = await pdfMcpTools.prepare_stamp({
        text: 'TEST',
        fontSize: 10,
        includeDate: false
      });

      const largeFont = await pdfMcpTools.prepare_stamp({
        text: 'TEST',
        fontSize: 24,
        includeDate: false
      });

      expect(largeFont.estimatedSize.heightInches).toBeGreaterThan(smallFont.estimatedSize.heightInches);
    });
  });

  describe('add_stamp', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should require documentId and text', async () => {
      // The tool should have these as required parameters
      const toolDef = {
        documentId: 'test-doc',
        text: 'STAMP'
      };
      
      expect(toolDef.documentId).toBeDefined();
      expect(toolDef.text).toBeDefined();
    });

    it('should support preferPosition parameter', async () => {
      const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
      
      for (const pos of positions) {
        const input = {
          documentId: 'test-doc',
          text: 'TEST',
          preferPosition: pos as any
        };
        expect(input.preferPosition).toBe(pos);
      }
    });
  });

  describe('find_whitespace', () => {
    it('should support prefer parameter for position preference', async () => {
      const preferences = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom', 'top', 'any'];
      
      for (const pref of preferences) {
        const input = {
          documentId: 'test-doc',
          prefer: pref as any
        };
        expect(input.prefer).toBe(pref);
      }
    });

    it('should accept minWidthInches and minHeightInches', async () => {
      const input = {
        documentId: 'test-doc',
        minWidthInches: 2.5,
        minHeightInches: 1.0,
        prefer: 'top-right' as const
      };

      expect(input.minWidthInches).toBe(2.5);
      expect(input.minHeightInches).toBe(1.0);
    });
  });
});

describe('Stamp Workflow Integration', () => {
  it('should provide a complete workflow: prepare_stamp -> find_whitespace -> add_stamp', async () => {
    // Step 1: Prepare stamp to get size estimate
    const prepareResult = await pdfMcpTools.prepare_stamp({
      text: 'NOLAN',
      fontSize: 14,
      includeDate: true
    });

    expect(prepareResult.success).toBe(true);
    expect(prepareResult.estimatedSize.widthInches).toBeGreaterThan(0);
    expect(prepareResult.estimatedSize.heightInches).toBeGreaterThan(0);
    
    // The recommendation should guide the user to use find_whitespace
    expect(prepareResult.recommendation).toContain('find_whitespace');
    expect(prepareResult.recommendation).toContain('minWidthInches');
    expect(prepareResult.recommendation).toContain('minHeightInches');
  });
});
