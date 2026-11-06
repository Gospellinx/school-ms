import type { SourceSection } from '@school-ms/core';

/** File types teachers can add to the knowledge base. */
export const KB_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'text/plain': 'Text',
  'text/markdown': 'Text',
  'image/jpeg': 'Photo',
  'image/png': 'Photo',
  'image/webp': 'Photo',
};

/** Works out the type from the file name when the browser does not say (common on phones). */
export function mimeFromName(fileName: string, given?: string): string | null {
  if (given && KB_MIME_TYPES[given]) return given;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return (
    {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      md: 'text/markdown',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }[ext] ?? null
  );
}

export type Extraction =
  | { kind: 'text'; sections: SourceSection[] }
  /** A scan or a photo: only AI (vision) can read it. */
  | { kind: 'needs_ai'; reason: string };

/** Fewer readable characters than this per page means the PDF is probably a scan. */
const MIN_CHARS_PER_PAGE = 80;

/** Pulls the text out of an uploaded file, page by page for PDFs. */
export async function extractText(data: Buffer, mimeType: string): Promise<Extraction> {
  if (mimeType === 'application/pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await pdfText(pdf, { mergePages: false });
    const pages = text;
    const total = pages.reduce((n, p) => n + p.trim().length, 0);
    if (total < MIN_CHARS_PER_PAGE * Math.max(1, pages.length) * 0.5) {
      return { kind: 'needs_ai', reason: 'This PDF looks like a scan, so its text has to be read by AI.' };
    }
    return { kind: 'text', sections: pages.map((p, i) => ({ locator: `Page ${i + 1}`, text: p })) };
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: data });
    return { kind: 'text', sections: [{ locator: null, text: value }] };
  }
  if (mimeType.startsWith('text/')) {
    return { kind: 'text', sections: [{ locator: null, text: data.toString('utf8') }] };
  }
  if (mimeType.startsWith('image/')) {
    return { kind: 'needs_ai', reason: 'Photos of notes have to be read by AI.' };
  }
  throw new Error('This file type is not supported');
}
