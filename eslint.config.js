// @ts-check
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    ignores: ["projects/**/*"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/component-class-suffix": [
        "error",
        { suffixes: ["Page", "Component"] },
      ],
      // `app-` for feature/shell components, `fit-` for the shared design-system layer.
      // Attribute selectors are allowed so UI primitives can enhance native
      // elements (e.g. `button[fit-button]`) and keep native semantics.
      "@angular-eslint/component-selector": [
        "error",
        { type: ["element", "attribute"], prefix: ["app", "fit"], style: "kebab-case" },
      ],
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: ["app", "fit"], style: "camelCase" },
      ],
    },
  },
  {
    // Demo data must stay isolated: only demo sources (and tests) may import *.demo.ts files.
    files: ["src/**/*.ts"],
    ignores: ["src/**/demo-*.source.ts", "src/**/*.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/*.demo"], message: "Demo data may only be imported by a demo-*.source.ts implementation." }] },
      ],
    },
  },
  {
    // The domain layer is framework-free so engines run in any TypeScript
    // environment (and later on the server). Keep it that way.
    files: ["src/app/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@angular/*", "@ionic/*", "@capacitor/*", "rxjs", "rxjs/*", "ionicons", "ionicons/*"], message: "The domain layer must stay framework-free." },
            { group: ["**/core/*", "**/core/**", "**/features/**", "**/shared/**", "**/shell/**"], message: "The domain layer must not depend on app layers." },
            { group: ["**/*.demo"], message: "Demo data may only be imported by a demo-*.source.ts implementation." },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  }
);
