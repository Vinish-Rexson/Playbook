// Metro config with the package-exports fixes Privy documents for viem/isows, zustand and jose.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const resolveRequestWithPackageExports = (context, moduleName, platform) => {
  // Package exports in `isows` (a viem dependency) are incompatible, so disable them.
  if (moduleName === 'isows') {
    const ctx = { ...context, unstable_enablePackageExports: false };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // Package exports in `zustand@4` are incompatible, so disable them.
  if (moduleName.startsWith('zustand')) {
    const ctx = { ...context, unstable_enablePackageExports: false };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // `jose` must resolve to its browser build.
  if (moduleName === 'jose') {
    const ctx = { ...context, unstable_conditionNames: ['browser'] };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.resolveRequest = resolveRequestWithPackageExports;

module.exports = config;
