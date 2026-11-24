import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "FBE — entorno sintético",
  description: "Demostración local de identidad y separación de acceso",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
