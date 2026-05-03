import jsPDF from 'jspdf';
import goldenDeerSeal from '@/assets/golden-deer-seal.png';

interface PDFMember {
  fullName: string;
  role: string;
  specialty: string;
}

interface PDFRole {
  id: string;
  label: string;
}

interface GeneratePDFInput {
  firmName: string;
  members: PDFMember[];
  roles: PDFRole[];
}

// No role icons in PDF — Helvetica doesn't include those glyphs and they render as garbled chars.

async function loadImageAsDataURL(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateFantasyFirmPDF({ firmName, members, roles }: GeneratePDFInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Palette (luxe corporate, fond crème, accents dorés)
  const cream: [number, number, number] = [250, 247, 240];
  const ink: [number, number, number] = [28, 30, 38];
  const muted: [number, number, number] = [130, 130, 138];
  const gold: [number, number, number] = [196, 158, 70];

  // Background
  doc.setFillColor(...cream);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Watermark diagonal (smaller, centered)
  doc.saveGraphicsState();
  // @ts-ignore
  doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...ink);
  doc.text('CONFIDENTIAL — INTERNAL DIRECTORY', pageW / 2, pageH / 2, {
    align: 'center',
    angle: 30,
  });
  doc.restoreGraphicsState();

  // Outer border (fine)
  const margin = 18;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
  // Inner double-line accent
  doc.setLineWidth(0.1);
  doc.rect(margin + 2, margin + 2, pageW - (margin + 2) * 2, pageH - (margin + 2) * 2);

  // Seal logo
  try {
    const logo = await loadImageAsDataURL(goldenDeerSeal);
    const logoSize = 28;
    doc.addImage(logo, 'PNG', (pageW - logoSize) / 2, margin + 10, logoSize, logoSize);
  } catch {}

  let y = margin + 10 + 28 + 10;

  // Helper: draw text centered while accounting for charSpace
  const drawCentered = (text: string, yPos: number, charSpace: number) => {
    const baseW = doc.getTextWidth(text);
    const totalW = baseW + charSpace * Math.max(0, text.length - 1);
    doc.text(text, (pageW - totalW) / 2, yPos, { charSpace });
  };

  // Firm name
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  drawCentered(firmName.toUpperCase(), y, 2);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  drawCentered('AVOCATS À LA COUR', y, 4);
  y += 6;

  // Gold separator
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  const sepW = 30;
  doc.line((pageW - sepW) / 2, y, (pageW + sepW) / 2, y);
  y += 10;

  // Sections by role (in order from `roles`)
  const contentLeft = margin + 10;
  const contentRight = pageW - margin - 10;

  for (const role of roles) {
    const group = members.filter(m => m.role === role.id);
    if (group.length === 0) continue;

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...gold);
    const title = `${role.label.toUpperCase()}${group.length > 1 ? 'S' : ''}`;
    doc.text(title, contentLeft, y, { charSpace: 2 });
    y += 2;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.2);
    doc.line(contentLeft, y, contentRight, y);
    y += 6;

    // Members
    for (const m of group) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text(m.fullName, contentLeft, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      const specialty = m.specialty || '';
      const specWidth = doc.getTextWidth(specialty);
      doc.text(specialty, contentRight - specWidth, y);

      // Dot leaders
      const nameWidth = doc.getTextWidth(m.fullName);
      const dotsStart = contentLeft + nameWidth + 2;
      const dotsEnd = contentRight - specWidth - 2;
      if (dotsEnd > dotsStart) {
        let dots = '';
        const dotW = doc.getTextWidth('.');
        const count = Math.floor((dotsEnd - dotsStart) / dotW);
        dots = '.'.repeat(Math.max(0, count));
        doc.setTextColor(200, 195, 180);
        doc.text(dots, dotsStart, y);
      }
      y += 7;

      if (y > pageH - margin - 25) {
        doc.addPage();
        doc.setFillColor(...cream);
        doc.rect(0, 0, pageW, pageH, 'F');
        y = margin + 15;
      }
    }
    y += 6;
  }

  // Footer
  const footerY = pageH - margin - 8;
  doc.setDrawColor(...muted);
  doc.setLineWidth(0.1);
  doc.line(margin + 10, footerY - 4, pageW - margin - 10, footerY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(
    `Date d'édition : ${today}   ·   Document généré par Fantasy Firm System`,
    pageW / 2,
    footerY,
    { align: 'center' }
  );

  const safeName = firmName.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cabinet';
  doc.save(`${safeName}.pdf`);
}