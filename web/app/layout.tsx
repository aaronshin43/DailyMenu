import Image from "next/image";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Dickinson Daily Menu",
  description: "Get Dickinson College dining menus delivered every morning.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <main className="page-card">
            <header className="page-header">
              <div className="brand-row">
                <div className="brand-mark">
                  <Image
                    src="/logo.png"
                    alt="Dickinson Daily Menu"
                    width={44}
                    height={44}
                    priority
                  />
                </div>
                <div className="brand-copy">
                  <h1>Dickinson Daily Menu</h1>
                  <p>
                    Subscribe once, then manage breakfast, lunch, dinner, and
                    station preferences from secure email links.
                  </p>
                </div>
              </div>
            </header>
            <section className="page-content">{children}</section>
          </main>
        </div>
      </body>
    </html>
  );
}
