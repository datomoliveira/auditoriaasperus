/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0C",
          2: "#121213",
        },
        bone: {
          DEFAULT: "#E9E6DF",
          dim: "#A3A099",
          faint: "#6E6B64",
        },
        rule: {
          DEFAULT: "rgba(233,230,223,0.13)",
          strong: "rgba(233,230,223,0.26)",
        },
        signal: {
          DEFAULT: "#C6F24E",
          dim: "#8FBF2E",
        },
        sev: {
          critical: "#FF4D2E",
          high: "#FF8A3D",
          medium: "#F2C14E",
          low: "#9BB0C9",
          info: "#8A877F",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: ['"Archivo"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        measure: "68ch",
      },
    },
  },
  plugins: [],
};
