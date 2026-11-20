import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inversiones Cavala — Sistema de Gestión Legal",
  description: "Sistema Web de Gestión Legal Documentaria — INVERSIONES CAVALA S.A.C.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
