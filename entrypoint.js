// Web Crypto polyfills must load before anything else (viem needs crypto.getRandomValues).
import './src/polyfills';
// Then hand off to Expo Router.
import 'expo-router/entry';
