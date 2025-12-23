export interface Iplugins {
  register: () => void;
  unregister: () => void;
  isRegistered: () => boolean;
}
