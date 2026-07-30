/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          50: "var(--text-primary)",
          100: "var(--text-primary)",
          200: "var(--text-primary)",
          300: "var(--text-secondary)",
          400: "var(--text-secondary)",
          500: "var(--text-muted)",
          600: "var(--text-muted)",
          700: "var(--border-strong)",
          800: "var(--border)",
          900: "var(--surface-elevated)",
          950: "var(--surface)",
        },
        emerald: {
          100: "var(--success)",
          200: "var(--success)",
          300: "var(--success)",
          400: "var(--success)",
        },
        amber: {
          200: "var(--warning)",
          300: "var(--warning)",
        },
        red: {
          200: "var(--danger)",
          300: "var(--danger)",
          400: "var(--danger)",
        },
        sky: {
          100: "var(--info)",
          200: "var(--info)",
          300: "var(--info)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
}
