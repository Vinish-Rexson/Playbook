/** Exact cancel message Flash validates byte-for-byte (note the em dash). */
export const cancelMessageFor = (orderId: string) => `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`;

/**
 * Batch cancel message (Flash docs, Cancel orders in batch): one lowercase UUID per line, in request order,
 * no trailing newline. Same bytes on EVM and Solana.
 */
export const batchCancelMessageFor = (orderIds: string[]) =>
  `Definitive Flash v1 — Cancel Orders\nOrders:\n${orderIds.map((id) => id.toLowerCase()).join('\n')}`;
