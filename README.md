# apssm

apssm - Atomic Publish/Subscribe State Manager. A set of functions to create atoms of state and subscribe to changes.

## Quick Example

```sh
npm install apssm
```

```tsx
import { createState, createContext } from 'apssm';

const countState = createState((c = 0) => c);
const context = createContext();

let count = context.get(countState); // get
context.set(countState, 2); // set (also returns value)
let unsub1 = context.subscribe(countState, (c) => console.log('after many changes', c)); // async (batched) subscribe
let unsub2 = context.syncSubscribe(countState, (c) => console.log('after every change', c)); // sync subscribe
```
