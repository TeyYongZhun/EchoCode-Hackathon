// Loaded before the tests: lets them import source files whose relative
// imports leave off the ".ts" extension, as esbuild allows.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(specifier)) throw err;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
