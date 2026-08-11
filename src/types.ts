export interface IncomingMessage {
  source: string;       // e.g. "generic-webhook"
  id: string;          // unique identifier for idempotency
  receivedAt: string;   // ISO timestamp
  payload: unknown;     // raw JSON body, untouched
}
