// Privy's WebCrypto polyfills must load before anything else (see Privy Expo install docs).
import '@privy-io/expo/polyfills';
// Then hand off to Expo Router.
import 'expo-router/entry';
