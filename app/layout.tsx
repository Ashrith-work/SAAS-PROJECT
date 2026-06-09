import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HotelTrack",
  description:
    "Prove that your agency's content drives real hotel bookings — content to visits to bookings to revenue.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorBackground: "#111827",
          colorInputBackground: "#0a0e1a",
          colorInputText: "#f9fafb",
          colorText: "#f9fafb",
          colorTextSecondary: "#9ca3af",
          colorPrimary: "#3b82f6",
          colorNeutral: "#f9fafb",
          colorDanger: "#ef4444",
          colorSuccess: "#10b981",
          colorWarning: "#f59e0b",
        },
        elements: {
          card: "bg-card border border-line",
          modalContent: "bg-card",
          userButtonPopoverCard: "bg-card border border-line",
        },
      }}
    >
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="flex min-h-full flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
