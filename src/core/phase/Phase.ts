export const Phase = {
  CONNECT : "connect",
  REQUEST : "request",
  RESPONSE : "response",
}

export type Phase = typeof Phase[keyof typeof Phase];