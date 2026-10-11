/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1200px" } },
    extend: {
      colors: {
        void: "#07080d",
        coal: "#0c0e16",
        panel: "#121527",
        neon: { blue: "#2e7bff", cyan: "#22e6ff", violet: "#8b5cf6" },
      },
      boxShadow: {
        glow: "0 0 24px rgba(46,123,255,.45), 0 0 48px rgba(34,230,255,.18)",
        card: "0 10px 40px rgba(0,0,0,.5)",
      },
      fontFamily: { cairo: ["var(--font-cairo)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
