import { EventEmitter } from "node:events";

export const packetEmitter = new EventEmitter();
packetEmitter.setMaxListeners(100);
