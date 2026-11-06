// Web Crypto for Hermes: viem / @scure need crypto.getRandomValues to generate keys.
// Only fills what is missing so nothing that already exists gets replaced.
import QuickCrypto from 'react-native-quick-crypto';

const g = globalThis as { crypto?: Partial<Crypto> };
if (!g.crypto) {
  g.crypto = QuickCrypto as unknown as Crypto;
} else {
  if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = QuickCrypto.getRandomValues as Crypto['getRandomValues'];
  }
  if (typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = QuickCrypto.randomUUID as Crypto['randomUUID'];
  }
}
