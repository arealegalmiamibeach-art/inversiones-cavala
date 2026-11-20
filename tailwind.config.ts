import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Varios catálogos en src/lib (colores de categorías del calendario,
    // materias de procesos) arman clases de Tailwind como strings en objetos
    // JS. Sin esta ruta, Tailwind nunca las ve y no genera su CSS — el color
    // del chip queda sin texto legible (parece "negro" sobre fondo oscuro).
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px -8px rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.06)",
        "glass-sm": "0 4px 16px -6px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.05)",
        "glass-lg": "0 20px 50px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.07)",
        glow: "0 0 40px -8px rgba(59,130,246,0.45)",
      },
      keyframes: {
        "aurora-1": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(4%,-6%) scale(1.08)" },
        },
        "aurora-2": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-6%,5%) scale(1.06)" },
        },
        "aurora-3": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(5%,4%) scale(1.1)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "aurora-1": "aurora-1 24s ease-in-out infinite",
        "aurora-2": "aurora-2 28s ease-in-out infinite",
        "aurora-3": "aurora-3 32s ease-in-out infinite",
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in-right": "slide-in-right 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
