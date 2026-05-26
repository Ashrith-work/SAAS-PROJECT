"use client";

import { useState } from "react";
import { ReportDocument, type ReportData } from "./ReportDocument";
import { recordReport } from "./report-actions";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

export function ReportMenu({
  hotelId,
  from,
  to,
  data,
}: {
  hotelId: string;
  from: string;
  to: string;
  data: ReportData;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excelHref = `/api/reports/excel?hotelId=${encodeURIComponent(hotelId)}&from=${from}&to=${to}`;

  async function handlePdf() {
    setGenerating(true);
    setError(null);
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const cover = document.getElementById("report-cover");
      const body = document.getElementById("report-body");
      if (!cover || !body) throw new Error("Report content not ready.");

      const pdf = new jsPDF("p", "pt", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const opts = { scale: 2, backgroundColor: "#ffffff", logging: false } as const;

      // Cover = one full page.
      const coverCanvas = await html2canvas(cover, opts);
      pdf.addImage(coverCanvas.toDataURL("image/png"), "PNG", 0, 0, pageW, pageH);

      // Body = sliced across as many pages as needed.
      const bodyCanvas = await html2canvas(body, opts);
      const bodyImg = bodyCanvas.toDataURL("image/png");
      const imgH = (bodyCanvas.height * pageW) / bodyCanvas.width;
      pdf.addPage();
      pdf.addImage(bodyImg, "PNG", 0, 0, pageW, imgH);
      let heightLeft = imgH - pageH;
      let position = 0;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(bodyImg, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
      }

      pdf.save(`HotelTrack-${slug(data.hotelName)}-${to}.pdf`);
      await recordReport(hotelId, from, to);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Generate Report ▾
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={handlePdf}
            disabled={generating}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800"
          >
            {generating ? "Generating PDF…" : "PDF report"}
            <span className="block text-xs text-zinc-500">Branded, owner-friendly</span>
          </button>
          <a
            href={excelHref}
            onClick={() => setOpen(false)}
            className="block w-full border-t border-zinc-100 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            Excel export
            <span className="block text-xs text-zinc-500">4 sheets · raw data</span>
          </a>
        </div>
      )}

      {error && (
        <p className="absolute right-0 mt-1 w-56 text-right text-xs text-red-600">{error}</p>
      )}

      {/* Off-screen source for the PDF rasteriser. */}
      <ReportDocument data={data} />
    </div>
  );
}
