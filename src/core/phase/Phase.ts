export const Phase = {
  CONNECT : "connect",
  REQUEST : "request",
  RESPONSE : "response",
  TCP:"tcp"
}

export type Phase = typeof Phase[keyof typeof Phase];