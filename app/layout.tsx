import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/ThemeProvider";
import { validatePlatformEnv } from "@/lib/env-validation";

// Fail loud at startup if platform integration credentials are missing/empty or
// partially configured (the silent-broken state that orphaned connections). Runs
// once per server instance at module load.
validatePlatformEnv();

const inter = Inter({
  variable: "--font-inter",
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
          // CSS-var references so Clerk widgets follow the active theme.
          colorBackground: "var(--card)",
          colorInputBackground: "var(--page)",
          colorInputText: "var(--ink)",
          colorText: "var(--ink)",
          colorTextSecondary: "var(--ink-tertiary)",
          colorPrimary: "var(--brand)",
          colorNeutral: "var(--ink)",
          colorDanger: "var(--danger)",
          colorSuccess: "var(--success)",
          colorWarning: "var(--warning)",
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
        suppressHydrationWarning
        className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="flex min-h-full flex-col">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
