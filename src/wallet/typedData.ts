// Flash returns EIP-712 payloads as JSON strings ({ domain, types, primaryType, message }).
// viem derives the EIP712Domain type from the domain itself, so drop Flash's copy and make sure
// chainId is a number (viem only includes chainId in the domain hash when it is a number/bigint).
export type TypedDataInput = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export function parseTypedData(json: string): TypedDataInput {
  const td = JSON.parse(json);
  const { EIP712Domain: _domainType, ...types } = td.types ?? {};
  const domain = { ...(td.domain ?? {}) };
  if (domain.chainId !== undefined) domain.chainId = Number(domain.chainId);
  return { domain, types, primaryType: td.primaryType, message: td.message ?? {} };
}
