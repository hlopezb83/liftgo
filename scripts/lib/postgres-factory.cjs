'use strict';

// v3 CommonJS exports the factory; v4 ESM exposes it as namespace.default.
// Resolve only: never instantiate a client or change its options here.
module.exports = function postgresFactory(imported) {
  const factory = typeof imported === 'function' ? imported
    : imported && typeof imported === 'object' && !Array.isArray(imported)
      && Object.hasOwn(imported, 'default') ? imported.default : undefined;
  if (typeof factory !== 'function') {
    throw new TypeError('Expected a postgres factory or an ESM namespace with a default factory');
  }
  return factory;
};
