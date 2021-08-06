import { strict as assert } from 'assert';
import { create, createDerived, createContext } from 'apssm';

assert.equal(typeof create, 'function');
assert.equal(typeof createDerived, 'function');
assert.equal(typeof createContext, 'function');

// Assert get -> set -> set -> get works.
{
	const context = createContext();
	const plus1 = create((n: number) => n + 1, 0);

	assert.equal(context.get(plus1), 1);
	assert.equal(context.set(plus1, 2), 3);
	assert.equal(context.set(plus1, 3), 4);
	assert.equal(context.get(plus1), 4);
}

// Assert sync subscribe and unsubscribe works.
{
	const context = createContext();
	const count = create((n: number) => n, 0);

	let currentCount = 1;
	const tracker = new assert.CallTracker();
	const callback = tracker.calls((c: number) => {
		assert.equal(c, currentCount);
	}, 2);

	const unsub = context.syncSubscribe(count, callback);

	context.set(count, currentCount);
	context.set(count, ++currentCount);

	assert.equal(unsub(), true);

	context.set(count, 3);

	tracker.verify();
}

// Assert async subscribe and unsubscribe works.
{
	const context = createContext();
	const count = create((n: number) => n, 0);

	let currentCount = 1;
	const tracker = new assert.CallTracker();
	const callback = tracker.calls((c: number) => {
		assert.equal(c, currentCount);
	}, 1);

	const unsub = context.subscribe(count, callback);

	context.set(count, currentCount);
	context.set(count, ++currentCount);

	Promise.resolve()
		.then(() => {
			assert.equal(unsub(), true);
			context.set(count, 3);
			return new Promise((r) => setTimeout(r, 10));
		})
		.then(() => {
			tracker.verify();
		});
}
