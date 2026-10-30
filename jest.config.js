const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // Las copias de trabajo de .claude/worktrees traen sus propias pruebas.
  testPathIgnorePatterns: ["/node_modules/", "/\\.claude/"],
  transform: {
    ...tsJestTransformCfg,
  },
};