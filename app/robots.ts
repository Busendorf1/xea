import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/privacy',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/user/',
          '/about',
          '/faq',
          '/careers',
          '/help',
          '/advert',
          '/business-update',
          '/market-value',
          '/join',
          '/login',
        ],
      },
      {
        userAgent: [
          'GPTBot',
          'ClaudeBot',
          'PerplexityBot',
          'CCBot',
          'Google-Extended',
        ],
        allow: [
          '/',
          '/privacy',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/user/',
          '/about',
          '/faq',
          '/careers',
          '/help',
          '/advert',
          '/business-update',
          '/market-value',
        ],
      },
    ],
    sitemap: 'https://paayh.com/sitemap.xml',
  }
}
