/**
 * Load the app's TypeScript constants from plain Node — no ts-node, no build.
 *
 * Registers a require hook that transpiles .ts/.tsx on the fly with the repo's
 * own `typescript` (transpileModule → CommonJS, one file at a time, no type
 * check) and resolves the `@/…` alias to the repo root. Type-only imports
 * vanish on transpile; a runtime import of `lib/personaTheme` (theme tables the
 * scripts never read) is stubbed so an unrelated React Native import there can
 * never break a build-time script.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ts = require(path.join(REPO_ROOT, 'node_modules', 'typescript'));

const STUBS = {
  // Only `PersonaId` (a type) is imported from here by the constants; stub the
  // module anyway so the loader is independent of what the theme file pulls in.
  [path.join(REPO_ROOT, 'lib', 'personaTheme.ts')]: { PERSONAS: {}, getPersonaTheme: () => ({}) },
};

let installed = false;

function install() {
  if (installed) return;
  installed = true;

  const compile = (module, filename) => {
    const stub = STUBS[filename];
    if (stub) {
      module.exports = stub;
      return;
    }
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
        isolatedModules: true,
      },
      reportDiagnostics: false,
    });
    module._compile(out.outputText, filename);
  };
  Module._extensions['.ts'] = compile;
  Module._extensions['.tsx'] = compile;

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      request = path.join(REPO_ROOT, request.slice(2));
    }
    return origResolve.call(this, request, parent, ...rest);
  };
}

/**
 * The app's own technique entries, flattened to one shape:
 * { id, exerciseName, aliases, posture, cameraAngle, cameraNote, source: 'form'|'card' }
 * plus the workout library (for body-part grouping).
 */
function loadTechniqueData() {
  install();
  const formLib = require(path.join(REPO_ROOT, 'constants', 'exerciseFormLibrary.ts'));
  const cardsMod = require(path.join(REPO_ROOT, 'constants', 'techniqueCards.ts'));
  const library = require(path.join(REPO_ROOT, 'constants', 'exerciseLibrary.ts')).EXERCISE_LIBRARY;
  const experts = require(path.join(REPO_ROOT, 'constants', 'experts.ts')).EXPERT_PROGRAMS;

  const forms = formLib.EXERCISE_FORM_LIBRARY;
  const cards = cardsMod.TECHNIQUE_CARDS;
  if (!Array.isArray(forms) || !Array.isArray(cards)) throw new Error('constants did not load as arrays');

  const entries = [];
  for (const f of forms) {
    // getOwnTechnique resolves camera defaults + the FORM_POSTURE table for us.
    const own = formLib.getOwnTechnique(f.exerciseName);
    if (!own || own.id !== f.id) throw new Error(`getOwnTechnique did not resolve form ${f.id}`);
    entries.push({
      id: f.id,
      exerciseName: f.exerciseName,
      aliases: f.aliases ?? [],
      posture: own.posture,
      cameraAngle: own.cameraAngle,
      cameraNote: own.cameraNote ?? '',
      source: 'form',
    });
  }
  for (const c of cards) {
    entries.push({
      id: c.id,
      exerciseName: c.exerciseName,
      aliases: c.aliases ?? [],
      posture: c.posture,
      cameraAngle: c.cameraAngle,
      cameraNote: c.cameraNote ?? '',
      source: 'card',
    });
  }
  const seen = new Set();
  for (const e of entries) {
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(e.id)) throw new Error(`bad id ${JSON.stringify(e.id)}`);
    if (seen.has(e.id)) throw new Error(`duplicate id ${e.id}`);
    seen.add(e.id);
  }
  return { entries, forms, cards, library, experts };
}

module.exports = { install, loadTechniqueData, REPO_ROOT };
