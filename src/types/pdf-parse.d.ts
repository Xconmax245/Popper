/**
 * Minimal type declaration for `pdf-parse`.
 *
 * The package ships no types. We only use the library entry point
 * (`pdf-parse/lib/pdf-parse.js`) to avoid the debug block in the package's
 * index.js that reads a bundled test PDF when it believes it is the main
 * module — that block crashes under bundlers/Next.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}
