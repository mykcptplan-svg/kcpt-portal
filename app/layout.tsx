import type { Metadata } from "next";
import { Anton, Caveat, Inter } from "next/font/google";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const themeBootstrapScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KCPT Portal",
  description: "KCPT member portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${anton.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
