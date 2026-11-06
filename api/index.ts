/// <reference types="node" />
// Vercel serverless entry: serves the Expo Router API routes (src/app/api) from the server-only
// export in dist/server. Built by `vercel.json` -> `expo export -p web --no-ssg`.
// Docs: https://docs.expo.dev/router/web/api-routes/ (Vercel section). Kept in CommonJS as documented.
const { createRequestHandler } = require('expo-server/adapter/vercel');

module.exports = createRequestHandler({
  build: require('path').join(__dirname, '../dist/server'),
});
