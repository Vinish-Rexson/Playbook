/** Exact cancel message Flash validates byte-for-byte (note the em dash). */
export const cancelMessageFor = (orderId: string) => `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`;
