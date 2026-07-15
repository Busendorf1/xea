<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8"/>
<xsl:template match="/">
<html lang="en">
<head>
  <title>Paayh | Ads For Listeners</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&amp;display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #2563eb;
      --secondary: #3b82f6;
      --bg: #000000;
      --glass: rgba(255, 255, 255, 0.05);
      --glass-border: rgba(255, 255, 255, 0.08);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg);
      color: #fff;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      position: relative;
    }

    /* Animated Radial Glow Background */
    body::before {
      content: '';
      position: absolute;
      width: 150vw;
      height: 150vh;
      background: radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.08) 0%, transparent 60%);
      animation: pulse 12s infinite alternate ease-in-out;
      z-index: 0;
    }

    @keyframes pulse {
      from { transform: translate(-5%, -5%) scale(1); }
      to { transform: translate(5%, 5%) scale(1.08); }
    }

    .container {
      position: relative;
      z-index: 10;
      max-width: 600px;
      width: 90%;
      padding: 3.5rem 2.5rem;
      background: var(--glass);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border: 1px solid var(--glass-border);
      border-radius: 32px;
      text-align: center;
      box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
    }

    .logo-glow {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      width: 80px;
      height: 80px;
      background: var(--primary);
      filter: blur(40px);
      opacity: 0.25;
    }

    h1 {
      font-size: clamp(2rem, 6vw, 3rem);
      font-weight: 700;
      line-height: 1.15;
      margin-bottom: 1.25rem;
      background: linear-gradient(135deg, #ffffff 30%, #a1a1aa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    h1 span {
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    p {
      font-size: 1.05rem;
      color: rgba(255, 255, 255, 0.65);
      margin-bottom: 2.5rem;
      max-width: 450px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.6;
    }

    .btn {
      display: inline-block;
      background: #ffffff;
      color: #000000;
      padding: 1.1rem 2.75rem;
      border-radius: 100px;
      text-decoration: none;
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: 0.5px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 24px rgba(255, 255, 255, 0.08);
    }

    .btn:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(255, 255, 255, 0.15);
      filter: brightness(1.05);
    }

    .badge {
      display: inline-block;
      padding: 0.4rem 0.9rem;
      background: rgba(37, 99, 235, 0.1);
      border: 1px solid rgba(37, 99, 235, 0.18);
      color: var(--secondary);
      border-radius: 50px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 1.25rem;
    }

    /* Hide technical sitemap data from human visitors */
    #sitemap-data {
      display: none;
    }
  </style>
</head>
<body>
  <div class="logo-glow"></div>
  <div class="container">
    <div class="badge">Attention Redefined</div>
    <h1>Ads for<br/><span>Listeners.</span></h1>
    <p>Connecting advertisers with verified human attention. Fair rewards. Full transparency.</p>
    <a href="https://paayh.com" class="btn">Explore Platform</a>
  </div>

  <div id="sitemap-data">
    <xsl:for-each select="urlset/url">
      <url>
        <loc><xsl:value-of select="loc"/></loc>
        <lastmod><xsl:value-of select="lastmod"/></lastmod>
      </url>
    </xsl:for-each>
  </div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
