import { strict as assert } from 'assert';
import { create, createDerived, createContext } from 'apssm';

assert.equal(typeof create, 'function');
assert.equal(typeof createDerived, 'function');
assert.equal(typeof createContext, 'function');
