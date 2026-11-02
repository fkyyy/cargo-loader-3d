import { solve } from './packer.js';
self.onmessage = e => self.postMessage(solve(e.data));