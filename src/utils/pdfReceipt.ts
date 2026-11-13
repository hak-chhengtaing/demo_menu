import { jsPDF } from 'jspdf';
import type { ReceiptData } from '../types';

export function downloadReceiptPDF(receipt: ReceiptData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200],
  });

  let y = 10;
  const left = 6;
  const right = 74;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(receipt.restaurant_name || 'DineEasy Bistro', 40, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  if (receipt.restaurant_address) {
    const addrLines = doc.splitTextToSize(receipt.restaurant_address, 66);
    doc.text(addrLines, 40, y, { align: 'center' });
    y += addrLines.length * 3.5;
  }
  if (receipt.restaurant_phone) {
    doc.text(`Tel: ${receipt.restaurant_phone}`, 40, y, { align: 'center' });
    y += 5;
  }

  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 4;

  doc.setFontSize(8);
  doc.text(`Receipt: ${receipt.receipt_number}`, left, y);
  y += 4;
  doc.text(`Table: Table ${receipt.table_number}`, left, y);
  doc.text(`Staff: ${receipt.staff_name}`, right, y, { align: 'right' });
  y += 4;
  doc.text(`Orders: ${(receipt.order_numbers || []).join(', ')}`, left, y);
  y += 4;
  doc.text(`Date: ${receipt.paid_at}`, left, y);
  y += 4;

  doc.line(left, y, right, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Item', left, y);
  doc.text('Qty', 46, y, { align: 'right' });
  doc.text('Total', right, y, { align: 'right' });
  y += 3.5;
  doc.setFont('helvetica', 'normal');

  for (const item of receipt.items) {
    const nameLines = doc.splitTextToSize(item.name, 36);
    doc.text(nameLines, left, y);
    doc.text(String(item.qty), 46, y, { align: 'right' });
    doc.text(`$${Number(item.subtotal).toFixed(2)}`, right, y, { align: 'right' });
    y += Math.max(4, nameLines.length * 3.5);
  }

  y += 1;
  doc.line(left, y, right, y);
  y += 4;

  const row = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, left, y);
    doc.text(val, right, y, { align: 'right' });
    y += 4;
  };

  row('Subtotal', `$${Number(receipt.subtotal).toFixed(2)}`);
  if (receipt.discount > 0) {
    row(`Discount${receipt.discount_label ? ` (${receipt.discount_label})` : ''}`, `-$${Number(receipt.discount).toFixed(2)}`);
  }
  if (receipt.service_charge > 0) {
    row('Service Charge', `$${Number(receipt.service_charge).toFixed(2)}`);
  }
  if (receipt.tax > 0) {
    row('Tax', `$${Number(receipt.tax).toFixed(2)}`);
  }

  doc.setFontSize(9.5);
  row('GRAND TOTAL (USD)', `$${Number(receipt.total).toFixed(2)}`, true);
  doc.setFontSize(8);
  const totalKhr = Math.round(Number(receipt.total) * Number(receipt.exchange_rate_khr || 4050));
  row('GRAND TOTAL (KHR)', `${totalKhr.toLocaleString()} KHR`);
  row('Payment Method', receipt.method.toUpperCase());
  row('Payment Status', 'PAID (VERIFIED)');

  y += 2;
  doc.line(left, y, right, y);
  y += 5;
  doc.setFontSize(7.5);
  const footer = receipt.footer_en || 'Thank you for dining with us!';
  const footerLines = doc.splitTextToSize(footer, 66);
  doc.text(footerLines, 40, y, { align: 'center' });

  doc.save(`${receipt.receipt_number}.pdf`);
}
