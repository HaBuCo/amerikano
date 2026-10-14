import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const hooks: any[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const finishedRounds: number[] = [];
  let finish!: (result: { finished: boolean }) => void;
  let animations = 0;
  const cleanup: (() => void)[] = [];
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(readFileSync(new URL('../src/components/round-intro.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === 'react') return {
      useRef: (value: unknown) => { const index = cursor++; return hooks[index] ??= { current: value }; },
      useState: (init: () => unknown) => { const index = cursor++; return [hooks[index] ??= init()]; },
      useEffect: (effect: () => void, dependencies: unknown[]) => {
        const index = cursor++;
        if (!hooks[index] || dependencies.some((value, key) => hooks[index][key] !== value)) effects.push(effect);
        hooks[index] = dependencies;
      },
    };
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    if (name === '@/i18n/language') return { useTranslations: () => ({ t: (text: string) => text }) };
    if (name === '@/constants/palette') return { palette: {} };
    if (name === '@/game/contracts') return { ROUND_CONTRACTS: [{ title: 'First round' }, { title: 'Second round' }] };
    if (name === 'react-native') return {
      Platform: { OS: 'android' }, StyleSheet: { create: (styles: unknown) => styles }, Text: {}, View: {},
      Easing: { cubic: {}, in: () => {}, out: () => {} },
      Animated: {
        Value: class { stopAnimation() {} setValue() {} interpolate() {} }, View: {}, delay: () => {}, timing: () => {},
        sequence: () => ({ start: (callback: typeof finish) => { animations++; finish = callback; }, stop: () => finish({ finished: false }) }),
      },
    };
    throw new Error(`Unexpected import: ${name}`);
  } });
  const onComplete = (round: number) => finishedRounds.push(round);
  return {
    render: (props: Record<string, unknown> = {}) => {
      cursor = 0;
      exports.RoundIntro({ roundIndex: 0, starterName: 'Bot', onComplete, ...props });
      for (const effect of effects.splice(0)) {
        const result = effect();
        if (typeof result === 'function') cleanup.push(result);
      }
    },
    finish: (finished: boolean) => finish({ finished }),
    stop: () => { for (const callback of cleanup.splice(0)) callback(); },
    finishedRounds, animations: () => animations,
  };
}

test('play is released only when the round intro finishes, once per round', () => {
  const f = fixture();
  f.render();
  assert.deepEqual(f.finishedRounds, []);
  f.finish(true);
  assert.deepEqual(f.finishedRounds, [0]);
  f.render();
  assert.equal(f.animations(), 1);
  f.render({ roundIndex: 1 });
  assert.deepEqual(f.finishedRounds, [0]);
  f.finish(true);
  assert.deepEqual(f.finishedRounds, [0, 1]);
});

test('an interrupted intro can replay after the tutorial closes', () => {
  const f = fixture();
  f.render();
  f.stop();
  assert.deepEqual(f.finishedRounds, []);
  f.render({ enabled: false });
  f.render({ enabled: true });
  assert.equal(f.animations(), 2);
  f.finish(true);
  assert.deepEqual(f.finishedRounds, [0]);
});

test('disabled intro mode releases play without waiting for an animation', () => {
  const f = fixture();
  f.render({ mode: 'off' });
  assert.equal(f.animations(), 0);
  assert.deepEqual(f.finishedRounds, [0]);
});
