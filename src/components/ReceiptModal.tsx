import { Download, Printer, X, CheckCircle2 } from 'lucide-react';
import { downloadReceiptPDF } from '../utils/pdfReceipt';
import type { ReceiptData } from '../types';

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  if (!receipt) return null;

  const khrTotal = Math.round(Number(receipt.total) * Number(receipt.exchange_rate_khr || 4050));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold text-sm">Digital Receipt · {receipt.receipt_number}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
            aria-label="Close receipt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm space-y-4">
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <h2 className="text-lg font-bold tracking-tight">{receipt.restaurant_name}</h2>
            {receipt.restaurant_address && (
              <p className="text-xs text-slate-500 mt-0.5">{receipt.restaurant_address}</p>
            )}
            {receipt.restaurant_phone && (
              <p className="text-xs text-slate-500">Tel: {receipt.restaurant_phone}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-y-1.5 text-xs text-slate-600 border-b border-dashed border-slate-300 pb-3">
            <div>
              <span className="text-slate-400">Receipt / វិក្កយបត្រ:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{receipt.receipt_number}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400">Table / តុ:</span>{' '}
              <span className="font-semibold text-slate-900">Table {receipt.table_number}</span>
            </div>
            <div>
              <span className="text-slate-400">Orders:</span>{' '}
              <span className="font-mono text-slate-800">{(receipt.order_numbers || []).join(', ')}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400">Staff:</span>{' '}
              <span className="text-slate-800">{receipt.staff_name}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">Date / កាលបរិច្ឆេទ:</span>{' '}
              <span className="font-mono text-slate-800">{receipt.paid_at}</span>
            </div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-1.5 font-medium">Item / មុខម្ហូប</th>
                <th className="text-right py-1.5 font-medium">Qty</th>
                <th className="text-right py-1.5 font-medium">Price</th>
                <th className="text-right py-1.5 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipt.items.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-2 pr-2 font-medium text-slate-800">{it.name}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{it.qty}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">${Number(it.price).toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-900">${Number(it.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-slate-300 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal / សរុបរង</span>
              <span className="tabular-nums">${Number(receipt.subtotal).toFixed(2)}</span>
            </div>
            {receipt.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount ({receipt.discount_label || 'Promo'})</span>
                <span className="tabular-nums">-${Number(receipt.discount).toFixed(2)}</span>
              </div>
            )}
            {receipt.service_charge > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Service Charge</span>
                <span className="tabular-nums">${Number(receipt.service_charge).toFixed(2)}</span>
              </div>
            )}
            {receipt.tax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span className="tabular-nums">${Number(receipt.tax).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>Total / សរុបរួម</span>
              <span className="tabular-nums">${Number(receipt.total).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Equivalent in KHR</span>
              <span className="tabular-nums font-medium">{khrTotal.toLocaleString()} ៛</span>
            </div>
            <div className="flex justify-between text-xs pt-1 text-slate-700">
              <span>Payment Method / ការទូទាត់</span>
              <span className="font-semibold uppercase">{receipt.method} · PAID</span>
            </div>
          </div>

          <div className="text-center border-t border-dashed border-slate-300 pt-3 text-xs text-slate-500 space-y-1">
            {receipt.footer_en && <p>{receipt.footer_en}</p>}
            {receipt.footer_km && <p>{receipt.footer_km}</p>}
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-3 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
          <button
            onClick={() => downloadReceiptPDF(receipt)}
            className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
