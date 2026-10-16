import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "grand-prix-enquiry-form.html"] },
  js.configs.recommended,
  {
    rules: {
      /* The page swallows errors on purpose in a few places (a missing canvas
         or texture costs the globe, not the form), as try{...}catch(e){}. */
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { caughtErrors: "none" }],
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["api/**/*.js", "lib/**/*.js", "vite.config.js", "scripts/**/*.js"],
    languageOptions: { globals: globals.node },
  },
];
