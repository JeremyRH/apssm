const onSetSym = Symbol.for('apssm_onSet');
const initialArgsSym = Symbol.for('apssm_initialArgs');
const onGetSym = Symbol.for('apssm_onGet');
const dependenciesSym = Symbol.for('apssm_dependencies');
const scheduledPromiseSym = Symbol.for('apssm_scheduledPromise');
const subscribersBeingCalledSym = Symbol.for('apssm_subscribersBeingCalled');
const subscribersQueueSym = Symbol.for('apssm_subscribersQueue');
const subscribersSym = Symbol.for('apssm_subscribers');
const syncSubscribersSym = Symbol.for('apssm_syncSubscribers');
const valuesSym = Symbol.for('apssm_values');

type GenericFn = (...args: any[]) => any;

type Subscriber<Value = any> = (value: Value) => any;

interface Atom<OnSet extends GenericFn = GenericFn> {
	[onSetSym]: OnSet;
	[initialArgsSym]: Parameters<OnSet>;
}

type AtomValue<A extends Atom | DerivedAtom> = A extends Atom
	? ReturnType<A[typeof onSetSym]>
	: A extends DerivedAtom
	? ReturnType<A[typeof onGetSym]>
	: never;

interface DerivedAtom<OnGet extends GenericFn = GenericFn, Deps extends (Atom | DerivedAtom)[] = Atom[]> {
	[onGetSym]: OnGet;
	[dependenciesSym]: Deps;
}

interface Context {
	[scheduledPromiseSym]: Promise<void>;
	[subscribersBeingCalledSym]: boolean;
	[subscribersQueueSym]: Map<Atom, Set<Subscriber>>;
	[subscribersSym]: Map<Atom, Set<Subscriber>>;
	[syncSubscribersSym]: Map<Atom, Set<Subscriber>>;
	[valuesSym]: Map<Atom, any>;
	get: <A extends Atom>(atom: A) => AtomValue<A>;
	set: <A extends Atom>(atom: A, ...args: A[typeof initialArgsSym]) => AtomValue<A>;
	subscribe: <A extends Atom>(atom: A, callback: Subscriber<AtomValue<A>>) => () => boolean;
	syncSubscribe: <A extends Atom>(atom: A, callback: Subscriber<AtomValue<A>>) => () => boolean;
}

export function create<OnSet extends GenericFn>(onSet: OnSet, ...initialArgs: Parameters<OnSet>): Atom<OnSet> {
	return {
		[onSetSym]: onSet,
		[initialArgsSym]: initialArgs
	};
}

export function createDerived<OnGet extends GenericFn, Deps extends (Atom | DerivedAtom)[]>(
	onGet: OnGet,
	...dependencies: Deps
) {
	validateDependencies(dependencies);

	return {
		[onGetSym]: onGet,
		[dependenciesSym]: dependencies
	};
}

export function createContext(): Context {
	const context: Context = {
		[scheduledPromiseSym]: Promise.resolve(),
		[subscribersBeingCalledSym]: false,
		[subscribersQueueSym]: new Map(),
		[subscribersSym]: new Map(),
		[syncSubscribersSym]: new Map(),
		[valuesSym]: new Map(),
		// Set properties on creation of object to allow JS engines to optimize prop access.
		get: undefined as any,
		set: undefined as any,
		subscribe: undefined as any,
		syncSubscribe: undefined as any
	};

	context.get = getValue.bind(undefined, context);
	context.set = setValue.bind(undefined, context);
	context.subscribe = subscribe.bind(undefined, subscribersSym, context);
	context.syncSubscribe = subscribe.bind(undefined, syncSubscribersSym, context);

	return context;
}

function getValue<A extends Atom | DerivedAtom>(context: Context, atom: A): AtomValue<A> {
	if (isDerivedAtom(atom)) {
		const args = atom[dependenciesSym].map((dep) => getValue(context, dep));
		return atom[onGetSym].apply(undefined, args);
	}

	const valuesMap = context[valuesSym];

	if (!valuesMap.has(atom)) {
		const value = atom[onSetSym].apply(undefined, atom[initialArgsSym]);
		valuesMap.set(atom, value);
		return value;
	}

	return valuesMap.get(atom);
}

function setValue<A extends Atom>(context: Context, atom: A, ...args: A[typeof initialArgsSym]): AtomValue<A> {
	if (isDerivedAtom(atom)) {
		throw new TypeError('Derived atoms cannot be set');
	}

	if (context[subscribersBeingCalledSym]) {
		throw new Error('Cannot set a value while subscriber callbacks are being called');
	}

	const value = atom[onSetSym].apply(undefined, args);
	context[valuesSym].set(atom, value);

	const syncSubscribers = context[syncSubscribersSym].get(atom);

	if (syncSubscribers) {
		context[subscribersBeingCalledSym] = true;
		callSubscribers(syncSubscribers, value);
		context[subscribersBeingCalledSym] = false;
	}

	const subscribers = context[subscribersSym].get(atom);

	if (subscribers) {
		scheduleSubscribers(context, atom);
	}

	return value;
}

function subscribe<A extends Atom | DerivedAtom>(
	sym: typeof syncSubscribersSym | typeof subscribersSym,
	context: Context,
	atom: A,
	callback: Subscriber<AtomValue<A>>
): () => boolean {
	if (context[subscribersBeingCalledSym]) {
		throw new Error('Cannot subscribe while subscriber callbacks are being called');
	}

	if (isDerivedAtom(atom)) {
		if (sym === syncSubscribersSym) {
			throw new TypeError('Derived atoms cannot be sync subscribed');
		}

		let wasCalled = false;

		const wrappedCallback = () => {
			if (!wasCalled) {
				wasCalled = true;
				Promise.resolve().then(() => (wasCalled = false));
				callback(getValue(context, atom));
			}
		};
		const atoms = getRootAtoms(atom[dependenciesSym]);
		const unsubFns: (() => boolean)[] = [];

		atoms.forEach((atm) => {
			unsubFns.push(subscribe(subscribersSym, context, atm, wrappedCallback));
		});

		return () => {
			let allUnsub = true;
			for (const unsub of unsubFns) {
				const didUnsub = unsub();
				allUnsub = allUnsub && didUnsub;
			}
			return allUnsub;
		};
	}

	const subscribersMap = context[sym];
	let subscribers = subscribersMap.get(atom);

	if (!subscribers) {
		subscribers = new Set();
		subscribersMap.set(atom, subscribers);
	}

	subscribers.add(callback);

	return () => subscribers!.delete(callback);
}

function getRootAtoms(dependencies: (Atom | DerivedAtom)[], rootAtoms = new Set<Atom>()) {
	for (const atom of dependencies) {
		if (isDerivedAtom(atom)) {
			getRootAtoms(atom[dependenciesSym], rootAtoms);
		} else {
			rootAtoms.add(atom);
		}
	}

	return rootAtoms;
}

function scheduleSubscribers(context: Context, atom: Atom) {
	const subscribersMap = context[subscribersSym];
	let subscribers = subscribersMap.get(atom);

	if (!subscribers) {
		subscribers = new Set();
		subscribersMap.set(atom, subscribers);
	}

	const currentPromise = context[scheduledPromiseSym];
	const subscribersQueue = context[subscribersQueueSym];

	subscribersQueue.set(atom, subscribers);

	currentPromise.then(() => {
		if (currentPromise === context[scheduledPromiseSym]) {
			context[scheduledPromiseSym] = Promise.resolve();
			context[subscribersBeingCalledSym] = true;

			for (const [atm, subs] of Array.from(subscribersQueue.entries())) {
				callSubscribers(subs, getValue(context, atm));
			}

			context[subscribersBeingCalledSym] = false;
			subscribersQueue.clear();
		}
	});
}

function callSubscribers(subscribers: Set<Subscriber>, value: any) {
	subscribers.forEach((cb) => {
		try {
			cb(value);
		} catch (err) {
			console.error(err);
		}
	});
}

function validateDependencies(dependencies: (Atom | DerivedAtom)[]): asserts dependencies is (Atom | DerivedAtom)[] {
	if (!dependencies.length) {
		throw new TypeError('Derived atoms must have at least 1 dependency');
	}

	for (const atom of dependencies) {
		if (!atom || (!isAtom(atom) && !isDerivedAtom(atom))) {
			throw new TypeError('A derived atom\'s dependency is not an atom');
		}
	}
}

function isAtom<A extends Atom>(atom: A | DerivedAtom): atom is A {
	return atom.hasOwnProperty(onSetSym);
}

function isDerivedAtom<D extends DerivedAtom>(atom: D | Atom): atom is D {
	return atom.hasOwnProperty(onGetSym);
}
