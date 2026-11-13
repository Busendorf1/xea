import { NextRequest, NextResponse } from "next/server";
import { sanitizeRedirectUrl } from "@/lib/security/redirectHelper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const sanitizedBase = sanitizeRedirectUrl(searchParams.get("redirect"));

  // Preserve all payment gateway query parameters (reference, trxref, boost_ref, status, etc.)
  const forwardParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key !== "redirect") {
      forwardParams.set(key, value);
    }
  });

  const queryString = forwardParams.toString();
  const separator = sanitizedBase.includes("?") ? "&" : "?";
  const targetDeepLink = queryString ? `${sanitizedBase}${separator}${queryString}` : sanitizedBase;

  const safeHref = targetDeepLink.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeJsUrl = JSON.stringify(targetDeepLink);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${safeHref}" />
  <title>Returning to Paayh App...</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #000000;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
    }
    .card {
      max-width: 360px;
      width: 100%;
      padding: 28px 24px;
      border-radius: 16px;
      background: #0f172a;
      border: 1px solid #1e293b;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 800;
    }
    p {
      margin: 0 0 20px;
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.5;
    }
    a.btn {
      display: inline-block;
      background: #10b981;
      color: #000000;
      font-weight: 800;
      font-size: 15px;
      text-decoration: none;
      padding: 13px 24px;
      border-radius: 999px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Returning to Paayh App</h2>
    <p>Taking you back into the app to confirm your payment...</p>
    <a id="returnBtn" class="btn" href="${safeHref}">Open Paayh App</a>
  </div>
  <script>
    (function () {
      var target = ${safeJsUrl};
      try {
        window.location.replace(target);
      } catch (e) {}
      setTimeout(function () {
        try {
          window.location.href = target;
        } catch (e) {}
      }, 250);
      setTimeout(function () {
        try {
          var btn = document.getElementById("returnBtn");
          if (btn) btn.click();
        } catch (e) {}
      }, 700);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
