import "server-only";

import { getRazorpay } from "@/lib/razorpay";

export type InvoiceView = {
  id: string;
  number: string | null;
  amountPaise: number;
  status: string;
  /** ISO date string of when it was paid, or null. */
  paidAt: string | null;
  shortUrl: string | null;
};

/**
 * Fetches the invoice history for a subscription from Razorpay. Returns [] on any
 * failure (missing keys, network) so the billing page degrades gracefully rather
 * than erroring.
 */
export async function listInvoices(subscriptionId: string): Promise<InvoiceView[]> {
  try {
    const rzp = getRazorpay();
    const res = await rzp.invoices.all({ subscription_id: subscriptionId, count: 100 });
    return res.items.map((inv) => {
      const raw = inv as unknown as {
        id: string;
        invoice_number?: string | null;
        amount?: number;
        amount_paid?: number;
        status?: string;
        paid_at?: number | null;
        short_url?: string | null;
      };
      return {
        id: raw.id,
        number: raw.invoice_number ?? null,
        amountPaise: raw.amount ?? raw.amount_paid ?? 0,
        status: raw.status ?? "unknown",
        paidAt: raw.paid_at ? new Date(raw.paid_at * 1000).toISOString() : null,
        shortUrl: raw.short_url ?? null,
      };
    });
  } catch {
    return [];
  }
}
