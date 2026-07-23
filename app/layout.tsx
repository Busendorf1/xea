import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css"; 
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://paayh.com"),
  alternates: {
    canonical: "/",
  },
  title: "Paayh | Ads For Listeners",
  description:
    "Paayh is an attention-based digital advertising platform that fairly connects advertisers with genuine human attention. Secure ad deliverability or earn rewards for verified ad engagement.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Paayh | Ads For Listeners",
    description:
      "A digital advertising platform designed to fairly connect advertisers with genuine human attention.",
    url: "https://paayh.com",
    siteName: "Paayh",
    type: "website",
    images: [
      {
        url: "/image/og-image.png",
        width: 512,
        height: 512,
        alt: "Paayh - Ads For Listeners",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Paayh | Ads For Listeners",
    description:
      "A digital advertising platform designed to fairly connect advertisers with genuine human attention.",
    images: ["/image/og-image.png"],
  },
  keywords: ["Paayh", "digital advertising", "attention marketplace"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  if (saved === 'white' || saved === 'dark' || saved === 'semi-dark') {
                    document.documentElement.setAttribute('data-theme', saved);
                  } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

