/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-sh", "prettier-plugin-sql"],
  overrides: [
    {
      files: ["**/*.sql"],
      options: {
        language: "mariadb",
        keywordCase: "upper",
        linesBetweenQueries: 1,
      },
    },
  ],
};

export default config;
