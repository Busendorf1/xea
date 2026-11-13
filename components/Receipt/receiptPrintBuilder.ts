export interface PrintableReceiptRow {
  label: string;
  value: string;
  monospace?: boolean;
  highlight?: boolean;
}

export interface PrintableReceiptPayload {
  reference: string;
  isCredit: boolean;
  formattedAmount: string;
  statusText: string;
  statusTone: "success" | "pending" | "failed" | "reversed";
  rows: PrintableReceiptRow[];
}

export function resolveWithdrawalCharge(
  rawAmount: number,
  meta: Record<string, any>,
  isWithdrawal: boolean
): number {
  if (!isWithdrawal) return 0;

  const explicitFee = meta.transfer_fee ?? meta.fee;
  if (typeof explicitFee === "number" && Number.isFinite(explicitFee) && explicitFee >= 0) {
    return explicitFee;
  }
  if (typeof explicitFee === "string" && explicitFee.trim() !== "") {
    const parsed = parseFloat(explicitFee);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  if (meta.net_amount !== undefined && meta.net_amount !== null) {
    const net = parseFloat(String(meta.net_amount));
    if (Number.isFinite(net) && net >= 0 && rawAmount >= net) {
      return Number((rawAmount - net).toFixed(2));
    }
  }

  const gateway = String(meta.gateway || meta.provider || "kora").toLowerCase().trim();
  if (gateway === "paystack") {
    if (rawAmount <= 5000) return 10.75;
    if (rawAmount <= 50000) return 26.88;
    return 53.75;
  }

  if (rawAmount <= 5000) return 15;
  if (rawAmount <= 50000) return 25;
  return 35;
}

const PRINT_STYLES = `
  @page { size: 100mm auto; margin: 6mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #000000;
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt-container { width: 100%; display: flex; justify-content: center; padding: 16px 8px; }
  .receipt-box {
    width: 360px; max-width: 360px; min-width: 320px;
    border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px 20px;
    background: #ffffff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 1.5px solid #f1f5f9; padding-bottom: 14px; margin-bottom: 16px;
  }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #000000; }
  .receipt-title {
    font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;
    letter-spacing: 0.5px; text-align: right; margin-top: 5px;
  }
  .amount-section {
    text-align: center; padding: 14px 10px; margin-bottom: 16px;
    background: #f9f9f7; border-radius: 12px; border: 1px dashed #e2e8f0;
  }
  .amount-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
    color: #64748b; margin-bottom: 4px; font-weight: 600;
  }
  .amount-val { font-size: 26px; font-weight: 800; color: #000000; letter-spacing: -0.5px; }
  .grid { width: 100%; margin-bottom: 16px; border-collapse: collapse; }
  .grid tr { border-bottom: 1px solid #f1f5f9; }
  .grid tr.highlight-row { border-top: 1.5px solid #cbd5e1; font-weight: 700; }
  .grid td { padding: 8px 2px; font-size: 12px; }
  .grid td.label { color: #64748b; width: 42%; font-weight: 500; }
  .grid td.value { color: #000000; font-weight: 600; text-align: right; word-break: break-word; }
  .grid td.mono { font-family: monospace; }
  .grid tr.highlight-row td.label { color: #000000; font-weight: 700; }
  .grid tr.highlight-row td.value { color: #000000; font-size: 13px; }
  .badge {
    display: inline-block; padding: 2px 7px; border-radius: 9999px;
    font-size: 10px; font-weight: 700; text-transform: capitalize;
  }
  .badge-success { background: #f4f4f2; color: #000000; border: 1px solid #e2e8f0; }
  .badge-pending { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
  .badge-failed { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
  .badge-reversed { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
  .footer-note {
    text-align: center; font-size: 11px; color: #94a3b8;
    margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-weight: 500;
  }
  @media print {
    html, body { background: #ffffff !important; padding: 0 !important; margin: 0 !important; width: 100% !important; }
    .receipt-container { padding: 0 !important; margin: 0 !important; }
    .receipt-box {
      width: 360px !important; max-width: 360px !important; min-width: 320px !important;
      margin: 12px auto !important; border: 1px solid #e2e8f0 !important; border-radius: 14px !important;
      padding: 20px 18px !important; box-shadow: none !important; background: #ffffff !important;
    }
  }
`;

export function openPrintableReceiptWindow(payload: PrintableReceiptPayload): boolean {
  const printWindow = window.open("", "_blank", "width=440,height=720");
  if (!printWindow || !printWindow.document) {
    return false;
  }

  const doc = printWindow.document;
  doc.title = `Receipt_${payload.reference || "tx"}`;

  // Ensure clean head and body via safe DOM nodes (no document.write or innerHTML)
  while (doc.head.firstChild) doc.head.removeChild(doc.head.firstChild);
  while (doc.body.firstChild) doc.body.removeChild(doc.body.firstChild);

  const metaCharset = doc.createElement("meta");
  metaCharset.setAttribute("charset", "UTF-8");
  const metaViewport = doc.createElement("meta");
  metaViewport.setAttribute("name", "viewport");
  metaViewport.setAttribute("content", "width=device-width, initial-scale=1.0");
  const titleEl = doc.createElement("title");
  titleEl.textContent = `Receipt_${payload.reference || "tx"}`;
  const styleEl = doc.createElement("style");
  styleEl.textContent = PRINT_STYLES;

  doc.head.appendChild(metaCharset);
  doc.head.appendChild(metaViewport);
  doc.head.appendChild(titleEl);
  doc.head.appendChild(styleEl);

  const container = doc.createElement("div");
  container.className = "receipt-container";

  const box = doc.createElement("div");
  box.className = "receipt-box";

  const header = doc.createElement("div");
  header.className = "header";
  const brandWrap = doc.createElement("div");
  const brand = doc.createElement("div");
  brand.className = "brand";
  brand.textContent = "Paayh";
  brandWrap.appendChild(brand);

  const titleWrap = doc.createElement("div");
  const receiptTitle = doc.createElement("div");
  receiptTitle.className = "receipt-title";
  receiptTitle.textContent = "Transaction Receipt";
  titleWrap.appendChild(receiptTitle);

  header.appendChild(brandWrap);
  header.appendChild(titleWrap);
  box.appendChild(header);

  const amountSection = doc.createElement("div");
  amountSection.className = "amount-section";
  const amountLabel = doc.createElement("div");
  amountLabel.className = "amount-label";
  amountLabel.textContent = payload.isCredit ? "Amount Credited" : "Amount Paid / Transferred";
  const amountVal = doc.createElement("div");
  amountVal.className = "amount-val";
  amountVal.textContent = payload.formattedAmount;
  amountSection.appendChild(amountLabel);
  amountSection.appendChild(amountVal);
  box.appendChild(amountSection);

  const table = doc.createElement("table");
  table.className = "grid";
  const tbody = doc.createElement("tbody");

  const statusTr = doc.createElement("tr");
  const statusLabelTd = doc.createElement("td");
  statusLabelTd.className = "label";
  statusLabelTd.textContent = "Status";
  const statusValTd = doc.createElement("td");
  statusValTd.className = "value";
  const badge = doc.createElement("span");
  badge.className = `badge badge-${payload.statusTone}`;
  badge.textContent = payload.statusText;
  statusValTd.appendChild(badge);
  statusTr.appendChild(statusLabelTd);
  statusTr.appendChild(statusValTd);

  payload.rows.forEach((row, index) => {
    // Insert status badge right after Transaction Type (index 2)
    if (index === 2) {
      tbody.appendChild(statusTr);
    }
    const tr = doc.createElement("tr");
    if (row.highlight) tr.className = "highlight-row";
    const labelTd = doc.createElement("td");
    labelTd.className = "label";
    labelTd.textContent = row.label;
    const valTd = doc.createElement("td");
    valTd.className = row.monospace ? "value mono" : "value";
    valTd.textContent = row.value;
    tr.appendChild(labelTd);
    tr.appendChild(valTd);
    tbody.appendChild(tr);
  });

  if (payload.rows.length <= 2) {
    tbody.appendChild(statusTr);
  }

  table.appendChild(tbody);
  box.appendChild(table);

  const footer = doc.createElement("div");
  footer.className = "footer-note";
  footer.textContent = "Paayh • Official Transaction Slip";
  box.appendChild(footer);

  container.appendChild(box);
  doc.body.appendChild(container);

  printWindow.focus();
  setTimeout(() => {
    try {
      printWindow.print();
    } catch {}
    setTimeout(() => {
      try {
        printWindow.close();
      } catch {}
    }, 500);
  }, 100);

  return true;
}
