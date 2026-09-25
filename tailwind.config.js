/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        star: {
          purple: "#56216C",
          "purple-dark": "#3B1248",
          orange: "#FA5200",
          "orange-dark": "#D84300",
          green: "#76A628",
          lime: "#82B82C",
          magenta: "#B51772",
        },
      },
    },
  },
  plugins: [],
};
