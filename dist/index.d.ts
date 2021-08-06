declare const onSetSym: unique symbol;
declare const initialArgsSym: unique symbol;
declare const onGetSym: unique symbol;
declare const dependenciesSym: unique symbol;
declare const scheduledPromiseSym: unique symbol;
declare const subscribersBeingCalledSym: unique symbol;
declare const subscribersQueueSym: unique symbol;
declare const subscribersSym: unique symbol;
declare const syncSubscribersSym: unique symbol;
declare const valuesSym: unique symbol;
declare type GenericFn = (...args: any[]) => any;
declare type Subscriber<Value = any> = (value: Value) => any;
interface Atom<OnSet extends GenericFn = GenericFn> {
    [onSetSym]: OnSet;
    [initialArgsSym]: Parameters<OnSet>;
}
declare type AtomValue<A extends Atom | DerivedAtom> = A extends Atom ? ReturnType<A[typeof onSetSym]> : A extends DerivedAtom ? ReturnType<A[typeof onGetSym]> : never;
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
export declare function create<OnSet extends GenericFn>(onSet: OnSet, ...initialArgs: Parameters<OnSet>): Atom<OnSet>;
export declare function createDerived<OnGet extends GenericFn, Deps extends (Atom | DerivedAtom)[]>(onGet: OnGet, ...dependencies: Deps): {
    [onGetSym]: OnGet;
    [dependenciesSym]: Deps;
};
export declare function createContext(): Context;
export {};
