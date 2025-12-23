import EventEmitter from "events";
export const connectionEvents = new EventEmitter();

export const ConnectionTypes = {
    TCP:"tcp",
    HTTP : "http",
    CONNECT : "connect",
}