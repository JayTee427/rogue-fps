// The whole reason this file exists: `const hp3 = hit.e.mesh.position;` shipped
// in the AAA pass and threw a ReferenceError on essentially every enemy hit for
// weeks. Every other line in that block used `h.e`. It did not crash the game
// outright because the frame error boundary swallowed it, so the only symptom
// was being ejected to the menu roughly every fortieth hit - which reads as a
// mysterious gameplay bug rather than a typo.
//
// 779 tests never came close to it. They cover src/core, which is pure and
// testable by design; the throw was in src/game, the Three.js shell, which no
// unit test instantiates. A linter catches this entire class in milliseconds
// and does not care whether the code is testable.
//
// no-undef is the rule that matters here. The rest are kept deliberately quiet:
// this is a guard against broken code, not a style argument.

export default [
  {
    files: ["src/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        performance: "readonly", localStorage: "readonly", location: "readonly",
        console: "readonly", fetch: "readonly", matchMedia: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        AudioContext: "readonly", webkitAudioContext: "readonly",
        Image: "readonly", URL: "readonly", URLSearchParams: "readonly",
        MouseEvent: "readonly", KeyboardEvent: "readonly", TouchEvent: "readonly",
        HTMLElement: "readonly", Element: "readonly", CustomEvent: "readonly",
        process: "readonly", globalThis: "readonly",
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      "no-undef": "error",
      // A name assigned and never read is usually the other half of a typo.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      "no-sparse-arrays": "error",
      "valid-typeof": "error",
    },
  },
];
