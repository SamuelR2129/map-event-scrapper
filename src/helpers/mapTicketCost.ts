export const mapTicketCost = (ticketCost?: string): string | undefined => {
  if (typeof ticketCost !== "string") return undefined;

  const lower = ticketCost.toLowerCase();
  if (lower.includes("free")) return undefined;

  const match = lower.match(/\d+(?:\.\d{1,2})?/);
  return match ? match[0] : undefined;
};