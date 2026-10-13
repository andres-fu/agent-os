// Loaded with: node --test --import ./tools/onboard/test-support/deny-network.mjs
// Makes network entry points throw a fixed error. Local processes (git via
// execFileSync) are untouched: they are not sockets in this process.

import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

const MESSAGE = 'network disabled by deny-network.mjs';
const deny = () => {
  throw new Error(MESSAGE);
};

net.Socket.prototype.connect = deny;
dns.lookup = deny;
dns.promises.lookup = () => Promise.reject(new Error(MESSAGE));
globalThis.fetch = () => Promise.reject(new Error(MESSAGE));
syncBuiltinESMExports();
