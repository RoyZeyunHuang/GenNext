/**
 * 浏览器端从文件提取纯文本，供档案库使用
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const mime = file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (mime === "text/plain" || ext === "txt") {
    return readAsText(file);
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return extractDocx(file);
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return extractPdf(file);
  }
  return "";
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

const PDF_WORKER_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function extractPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");

  if (typeof pdfjsLib.GlobalWorkerOptions !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;
  }

  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF 加载失败: ${msg}`);
  }

  const numPages = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      parts.push(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF 第 ${i} 页解析失败: ${msg}`);
    }
  }

  return parts.join("\n");
}
