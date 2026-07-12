// Tailwind v4 (@tailwindcss/postcss) usa Lightning CSS internamente y ya
// aplica autoprefixing según el target del navegador. No hace falta
// autoprefixer explícito en el pipeline.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
