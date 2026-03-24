/** 导出 DOM 为 A4 多页 PDF（供 Campaign 报告等使用） */

export function safePdfFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const day = new Date().toISOString().slice(0, 10);
  return `${base || "campaign-report"}_${day}.pdf`;
}

export async function downloadDomAsPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const w = Math.max(1, Math.ceil(element.scrollWidth));
  const h = Math.max(1, Math.ceil(element.scrollHeight));

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    scrollX: 0,
    scrollY: 0,
    x: 0,
    y: 0,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
