// Temporary web stand-in for native-only modules while capturing store screenshots.
function stub(name) {
  const fn = function () { return stub(name + '()'); };
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (prop === Symbol.toPrimitive || prop === 'toString') return () => name;
      return stub(name + '.' + String(prop));
    },
    construct() { return stub('new ' + name); },
  });
}
module.exports = stub('native');
