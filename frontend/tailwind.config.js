/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        apple: {
          bg: "#000000",
          card: "rgba(22, 22, 26, 0.7)",
          border: "rgba(255, 255, 255, 0.08)",
          subtle: "rgba(255, 255, 255, 0.04)",
          blue: "#2997FF",
          green: "#30D158",
          orange: "#FF9F0A",
          red: "#FF453A",
          gray: "#86868B",
        },
      },
      backdropBlur: {
        apple: "20px",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        apple: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        glow: "0 0 40px -10px rgba(41, 151, 255, 0.3)",
      },
    },
  },
  plugins: [],
};
