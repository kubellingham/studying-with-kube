// Runs in the browser. Reads the text of every page of the chosen PDF so only
// the text (tens of KB) is sent to the server, never the file itself. This
// keeps uploads under Vercel's 4.5 MB request limit, makes phone uploads fast,
// and means the PDF never leaves the device.

export class PdfReadError extends Error {}

/** Raw text of each page, in order. Cleanup happens on the server (lib/pdf.ts). */
export async function readPdfText(file: File): Promise<string[]> {
  // pdf.js is large, so it's only loaded once someone actually picks a file.
  const { extractText, getDocumentProxy } = await import("unpdf");

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "PasswordException") {
      throw new PdfReadError("This PDF is password-protected. Remove the password and upload it again.");
    }
    throw new PdfReadError("Couldn't open this file as a PDF. It may be damaged.");
  }

  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
