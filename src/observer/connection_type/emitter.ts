import EventEmitter from "events";
export const connectionEvents = new EventEmitter();

export const ConnectionTypes = {
    CONNECT : "connect",
    HTTP : "http"
}