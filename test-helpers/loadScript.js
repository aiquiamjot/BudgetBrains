'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* Loads one or more of the app's plain script files (browser globals, no module
   syntax) into a sandboxed vm context, and returns the requested top-level
   bindings by name. There is no package manifest, no npm and no build step
   (see CLAUDE.md) — this is how a committed test reaches a `js/*.js` file's
   globals without turning it into a module.

   A `const`/`let` declared at a script's top level is not copied onto the
   context object vm.createContext wraps (only `var` and explicit global
   assignment are); it lives in the context's global lexical environment
   instead. Evaluating the bare name back in that same context reaches it. */
function loadScripts(relativePaths, globalNames) {
  const context = {};
  vm.createContext(context);
  for (const relativePath of relativePaths) {
    const file = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  const result = {};
  for (const name of globalNames) result[name] = vm.runInContext(name, context);
  return result;
}

module.exports = { loadScripts };
