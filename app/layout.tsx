import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The header shows who is signed in, so no page can be built ahead of time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "UniPulse HK",
    template: "%s · UniPulse HK",
  },
  description:
    "Hackathons, seminars, workshops, volunteering, internships and student jobs for university students in Hong Kong, collected daily by an AI agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-line py-6 text-center text-xs text-muted">
          UniPulse HK · built for students in Hong Kong · listings link to their original source
        </footer>
      </body>
    </html>
  );
}
