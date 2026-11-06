// unpdf ships ESM-only type declarations that `moduleResolution: node` cannot see. Only what we use.
declare module 'unpdf' {
  export interface PDFDocumentProxy {
    numPages: number;
  }
  export function getDocumentProxy(data: Uint8Array): Promise<PDFDocumentProxy>;
  export function extractText(pdf: PDFDocumentProxy, opts: { mergePages: false }): Promise<{ totalPages: number; text: string[] }>;
}
