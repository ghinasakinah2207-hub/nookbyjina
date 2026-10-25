/* eslint-disable @typescript-eslint/no-require-imports */
// Preload script to mock 'server-only' when running test scripts outside Next.js bundling environment
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, arguments);
};
