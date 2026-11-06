// Adds the deploy-time settings to app.json without hard-coding them:
//  - PLAYBOOK_API_ORIGIN (e.g. https://playbook-xyz.vercel.app): where release builds send their
//    relative `/api/...` requests (expo-router `origin`). Development builds keep using the dev server.
//  - SUPABASE_URL: the public release feed (latest.json) the app checks for a newer APK.
// Both are read from .env, which Expo loads before evaluating this file.
module.exports = ({ config }) => {
  const origin = process.env.PLAYBOOK_API_ORIGIN?.trim().replace(/\/$/, '') || undefined;
  const supabase = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const plugins = (config.plugins ?? []).map((p) =>
    p === 'expo-router' && origin ? ['expo-router', { origin }] : p,
  );
  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      releaseFeed: supabase ? `${supabase}/storage/v1/object/public/releases/latest.json` : undefined,
    },
  };
};
