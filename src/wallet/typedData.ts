// Flash returns EIP-712 payloads as JSON strings ({ domain, types, primaryType, message }).
// eth_signTypedData_v4 signers expect `types.EIP712Domain`; add it when Flash omits it.
const DOMAIN_FIELDS: [string, string][] = [
  ['name', 'string'],
  ['version', 'string'],
  ['chainId', 'uint256'],
  ['verifyingContract', 'address'],
  ['salt', 'bytes32'],
];

export function normalizeTypedData(json: string): string {
  const td = JSON.parse(json);
  if (td?.types && !td.types.EIP712Domain && td.domain) {
    td.types = {
      EIP712Domain: DOMAIN_FIELDS.filter(([k]) => td.domain[k] !== undefined).map(([name, type]) => ({ name, type })),
      ...td.types,
    };
  }
  return JSON.stringify(td);
}
