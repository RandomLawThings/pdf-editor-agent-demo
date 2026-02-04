/**
 * Polyfills for pdfjs-dist in Node.js
 * Must be imported before any pdf2pic or pdfjs-dist imports
 */

// DOMMatrix polyfill
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a;
        this.m12 = this.b;
        this.m21 = this.c;
        this.m22 = this.d;
        this.m41 = this.e;
        this.m42 = this.f;
      }
    }

    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(point: any) { return point; }
  }
  (globalThis as any).DOMMatrix = DOMMatrix;
}

// ImageData polyfill
if (typeof globalThis.ImageData === 'undefined') {
  class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string = 'srgb';

    constructor(width: number, height: number);
    constructor(data: Uint8ClampedArray, width: number, height?: number);
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height || (dataOrWidth.length / 4 / widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  }
  (globalThis as any).ImageData = ImageData;
}

// Path2D polyfill
if (typeof globalThis.Path2D === 'undefined') {
  class Path2D {
    private commands: string[] = [];

    constructor(path?: Path2D | string) {
      if (typeof path === 'string') {
        this.commands.push(path);
      }
    }

    addPath() {}
    closePath() { this.commands.push('Z'); }
    moveTo(x: number, y: number) { this.commands.push(`M${x},${y}`); }
    lineTo(x: number, y: number) { this.commands.push(`L${x},${y}`); }
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      this.commands.push(`C${cp1x},${cp1y},${cp2x},${cp2y},${x},${y}`);
    }
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      this.commands.push(`Q${cpx},${cpy},${x},${y}`);
    }
    arc() {}
    arcTo() {}
    ellipse() {}
    rect(x: number, y: number, w: number, h: number) {
      this.commands.push(`M${x},${y}h${w}v${h}h${-w}Z`);
    }
  }
  (globalThis as any).Path2D = Path2D;
}

export {};
