export const Phase = {
  HANDSHAKE : "handshake",
  REQUEST : "request",
  RESPONSE : "response",
  TCP:"tcp"
}

export type Phase = typeof Phase[keyof typeof Phase];