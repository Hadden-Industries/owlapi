const preservingFactories = new WeakSet();
const arities = new WeakMap();

export const markSourcePreservingFactory = (factory) => {
  preservingFactories.add(factory);
  return factory;
};

export const isSourcePreservingFactory = (factory) =>
  preservingFactories.has(factory);

export const retainSourceArity = (object, field, originalCount, minimum) => {
  arities.set(object, Object.freeze({ field, minimum, originalCount }));
  return object;
};

export const readSourceArity = (object) => arities.get(object);
