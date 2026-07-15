import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = 'https://paayh.com';

  // Only expose the landing page and the privacy policy to bots/sitemap
  const staticRoutes = [
    '',
    '/privacy',
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${staticRoutes
        .map((route) => `
          <url>
            <loc>${baseUrl}${route}</loc>
            <lastmod>${new Date().toISOString()}</lastmod>
            <changefreq>${route === '' ? 'daily' : 'weekly'}</changefreq>
            <priority>${route === '' ? '1.0' : '0.8'}</priority>
          </url>
        `)
        .join('')}
    </urlset>
  `;

  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
