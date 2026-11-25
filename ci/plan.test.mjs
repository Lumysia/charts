import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {INPUTS_LABEL, discover, gitArgSources, parseDockerfile, plan, changedPaths} from './plan.mjs';

const DAY = 86400000;
const NOW = Date.parse('2026-10-29T00:00:00Z');

function tree(t, files) {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'plan-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), {recursive: true});
    writeFileSync(join(root, path), text);
  }
  return root;
}

const recipes = {
  'proxy/Dockerfile': 'ARG BASE=alpine\nFROM builder-${BASE} AS build\nFROM --platform=$BUILDPLATFORM golang:1 AS tool\nFROM ${BASE}\nCOPY --from=build /x /x\n',
  'proxy/alpine.env': 'PLATFORMS=linux/amd64,linux/arm64\nBASE=alpine\n',
  'proxy/plus.env': '# comment\nPLATFORMS=linux/amd64\nBASE=alpine\nEXTRA=a b c\n',
  'proxy/old.env.disabled': 'PLATFORMS=linux/amd64\n',
  'app/external-git.txt': 'https://example.invalid/up/app.git\nlatest-release\n',
  'app/web.env': 'PLATFORMS=linux/amd64\n',
  'src/Dockerfile': 'ARG APP_REPO=https://example.invalid/up/src.git\nARG APP_REF=main\nFROM alpine:3 AS src\nFROM debian@sha256:abc\n',
  'src/main.env': 'PLATFORMS=linux/amd64\nAPP_REF=main\n',
  'off/Dockerfile': 'FROM alpine\n', 'off/x.env': 'PLATFORMS=linux/amd64\n', 'off/disabled': '',
  'ci/plan.mjs': '',
};

const digests = {'builder-alpine': 'sha256:b1', 'golang:1': 'sha256:g1', alpine: 'sha256:a1', 'alpine:3': 'sha256:a3', 'node:22': 'sha256:n1'};
const commits = {'https://example.invalid/up/app.git latest-release': 'c'.repeat(40), 'https://example.invalid/up/src.git main': 'd'.repeat(40)};

function fakeIO(root, {published = {}, overrides = {}} = {}) {
  const calls = [];
  return {
    root, calls, now: () => NOW,
    git: {hasCommit: () => true, diff: () => overrides.diff ?? []},
    imageDigest: (image, platform) => {
      calls.push(`digest ${image} ${platform}`);
      const all = overrides.digests ?? digests;
      return all[`${image} ${platform}`] ?? all[image] ?? assert.fail(`unexpected image ${image}`);
    },
    gitResolve: (repo, ref) => (overrides.commits ?? commits)[`${repo} ${ref}`] ?? assert.fail(`unexpected git ${repo} ${ref}`),
    gitFile: () => 'FROM node:22\n',
    published: ref => { calls.push(`published ${ref}`); return published[ref] ?? null; },
    baseChanged: () => true,
  };
}

const env = (o = {}) => ({CONTAINER_REGISTRY: 'docker.io', CONTAINER_NAMESPACE: 'Example', EVENT_NAME: 'schedule',
  REF: 'refs/heads/main', DEFAULT_BRANCH: 'main', MAX_AGE_DAYS: '7', ...o});

// What the published images would carry if built from today's inputs.
async function currentImages(root) {
  const full = await plan(env({FORCE: 'true'}), fakeIO(root));
  return Object.fromEntries(full.include.map(x => [`${x.image}:${x.variant}-nightly`, {
    created: new Date(NOW - DAY).toISOString(),
    labels: {[INPUTS_LABEL]: x.labels.slice(INPUTS_LABEL.length + 1)},
  }]));
}

test('discovers enabled variants and skips disabled projects and variants', t => {
  const found = discover(tree(t, recipes));
  assert.deepEqual(found.map(v => `${v.name}/${v.variant}`), ['app/web', 'proxy/alpine', 'proxy/plus', 'src/main']);
  const plus = found.find(v => v.variant === 'plus');
  assert.deepEqual(plus.buildArgs, {BASE: 'alpine', EXTRA: 'a b c'});
  assert.equal(plus.platforms, 'linux/amd64');
  assert.deepEqual(found.find(v => v.name === 'app').source, {repo: 'https://example.invalid/up/app.git', ref: 'latest-release'});
  assert.equal(found.find(v => v.name === 'app').dockerfile, 'external/app/Dockerfile');
});

test('PLATFORMS is required, without an architecture fallback', t => {
  assert.throws(() => discover(tree(t, {'p/Dockerfile': 'FROM a\n', 'p/v.env': 'X=1\n'})), /PLATFORMS is required in p\/v.env/);
});

test('Dockerfile FROM resolution follows global ARGs, build args and stages', () => {
  const {images, final, defaults} = parseDockerfile(recipes['proxy/Dockerfile'], {BASE: 'edge'});
  assert.deepEqual(images, ['builder-edge', 'golang:1', 'edge']);
  assert.equal(final, 'edge');
  assert.equal(defaults.BASE, 'alpine');
  const staged = parseDockerfile('FROM scratch AS empty\nFROM alpine AS one\nFROM one\nARG LATE=x\nFROM ${LATE:-busybox}\n');
  assert.deepEqual(staged.images, ['alpine', 'busybox']);
  assert.equal(parseDockerfile('FROM alpine AS one\nfrom one\n').final, 'alpine');
});

test('git sources come from <P>_REPO / <P>_REF build args', () => {
  assert.deepEqual(gitArgSources({APP_REPO: 'https://h/r.git', APP_REF: 'v1', NOT_REPO: 'plain', X_REPO: 'git@h:r'}),
    [{key: 'git:APP', repo: 'https://h/r.git', ref: 'v1'}, {key: 'git:X', repo: 'git@h:r', ref: ''}]);
});

test('registry and namespace must be configured, without fallbacks', async t => {
  const root = tree(t, recipes);
  for (const key of ['CONTAINER_REGISTRY', 'CONTAINER_NAMESPACE']) {
    for (const value of [undefined, '', '  ']) {
      await assert.rejects(plan(env({[key]: value}), fakeIO(root)), new RegExp(`${key} is required`));
    }
  }
});

test('no-change path: current images are skipped without any build', async t => {
  const root = tree(t, recipes);
  const io = fakeIO(root, {published: await currentImages(root)});
  const result = await plan(env(), io);
  assert.deepEqual(result.include, []);
  assert.deepEqual(result.skipped, ['app/web', 'proxy/alpine', 'proxy/plus', 'src/main']);
  // Each shared base is looked up once per run; nothing is pulled.
  assert.equal(io.calls.filter(c => c === 'digest alpine linux/amd64').length, 1);
});

test('a moved base digest or upstream commit rebuilds only the affected variants', async t => {
  const root = tree(t, recipes);
  const published = await currentImages(root);
  const moved = await plan(env(), fakeIO(root, {published, overrides: {digests: {...digests, alpine: 'sha256:a2'}}}));
  assert.deepEqual(moved.include.map(x => x.id), ['proxy/alpine', 'proxy/plus']);
  assert.match(moved.include[0].reasons, /^alpine linux\/amd64 a1 -> a2, linux\/arm64 a1 -> a2$/);
  assert.equal(moved.include[0].no_cache, true);

  const upstream = await plan(env(), fakeIO(root, {published, overrides: {commits: {...commits, 'https://example.invalid/up/src.git main': 'e'.repeat(40)}}}));
  assert.deepEqual(upstream.include.map(x => x.id), ['src/main']);
  assert.match(upstream.include[0].reasons, /git:APP dddddddddddd -> eeeeeeeeeeee/);
});

test('a base republished only for platforms we do not build is ignored', async t => {
  const root = tree(t, recipes);
  const published = await currentImages(root);
  // Official images often republish one slow architecture (riscv64) days later.
  const other = await plan(env(), fakeIO(root, {published, overrides: {digests: {...digests, 'alpine linux/riscv64': 'sha256:r2'}}}));
  assert.deepEqual(other.include, []);
  // A change to one platform we build rebuilds the variant and names that platform.
  const arm = await plan(env(), fakeIO(root, {published, overrides: {digests: {...digests, 'alpine linux/arm64': 'sha256:a2'}}}));
  assert.deepEqual(arm.include.map(x => `${x.id} ${x.reasons}`), ['proxy/alpine alpine linux/arm64 a1 -> a2']);
});

test('labels from before per-platform digests compare against the index digest', async t => {
  const root = tree(t, recipes);
  const published = await currentImages(root);
  const old = {[INPUTS_LABEL]: JSON.stringify({'builder-alpine': 'sha256:b1', 'golang:1': 'sha256:g1', alpine: 'sha256:a1'})};
  published['docker.io/example/proxy:plus-nightly'].labels = old;
  // Same index digest as when built: no rebuild just because the label format changed.
  const same = await plan(env(), fakeIO(root, {published}));
  assert.deepEqual(same.include, []);
  const moved = await plan(env(), fakeIO(root, {published, overrides: {digests: {...digests, alpine: 'sha256:a9'}}}));
  assert.deepEqual(moved.include.map(x => x.id), ['proxy/alpine', 'proxy/plus']);
  assert.match(moved.include.find(x => x.id === 'proxy/plus').reasons, /^alpine a1 -> linux\/amd64=/);
});

test('missing image, missing label and weekly age all rebuild', async t => {
  const root = tree(t, recipes);
  const published = await currentImages(root);
  delete published['docker.io/example/app:web-nightly'];
  published['docker.io/example/proxy:plus-nightly'].labels = {};
  published['docker.io/example/src:main-nightly'].created = new Date(NOW - 7 * DAY).toISOString();
  const result = await plan(env(), fakeIO(root, {published}));
  const why = Object.fromEntries(result.include.map(x => [x.id, x.reasons]));
  assert.deepEqual(Object.keys(why), ['app/web', 'proxy/plus', 'src/main']);
  assert.match(why['app/web'], /not published yet/);
  assert.match(why['proxy/plus'], /no ci.build.inputs label; final base alpine changed/);
  assert.match(why['src/main'], /last built 7.0 days ago/);
});

test('force and manual project selection', async t => {
  const root = tree(t, recipes);
  const published = await currentImages(root);
  const forced = await plan(env({EVENT_NAME: 'workflow_dispatch', PROJECT: 'proxy', FORCE: 'true', PUBLISH: 'true'}), fakeIO(root, {published}));
  assert.deepEqual(forced.include.map(x => `${x.id} ${x.reasons}`), ['proxy/alpine forced', 'proxy/plus forced']);
  assert.equal(forced.publish, true);
  const checked = await plan(env({EVENT_NAME: 'workflow_dispatch', PROJECT: 'proxy'}), fakeIO(root, {published}));
  assert.deepEqual(checked.include, []);
  assert.equal(checked.publish, false, 'manual runs publish only when asked');
  await assert.rejects(plan(env({PROJECT: 'off'}), fakeIO(root)), /No enabled variants for off/);
});

test('matrix entries carry tags, build args, the inputs label and the pinned source', async t => {
  const root = tree(t, recipes);
  const {include} = await plan(env({FORCE: 'true'}), fakeIO(root));
  const app = include.find(x => x.id === 'app/web');
  assert.equal(app.tags, 'docker.io/example/app:web-nightly');
  assert.equal(app.source_sha, 'c'.repeat(40));
  assert.equal(app.build_args, `GIT_COMMIT=${'c'.repeat(40)}`);
  assert.deepEqual(JSON.parse(app.labels.split('=').slice(1).join('=')), {'git:source': 'c'.repeat(40), 'node:22': 'linux/amd64=sha256:n1'});
  const src = include.find(x => x.id === 'src/main');
  assert.deepEqual(JSON.parse(src.labels.slice(INPUTS_LABEL.length + 1)),
    {'alpine:3': 'linux/amd64=sha256:a3', 'debian@sha256:abc': 'sha256:abc', 'git:APP': 'd'.repeat(40)});
  assert.equal(include.find(x => x.id === 'proxy/plus').build_args, 'BASE=alpine\nEXTRA=a b c');
});

test('tags: nightly on the default branch, git tag names, one latest per project, ci elsewhere', async t => {
  const root = tree(t, recipes);
  const tagged = await plan(env({EVENT_NAME: 'push', REF: 'refs/tags/v1.2'}), fakeIO(root));
  assert.deepEqual(tagged.include.map(x => x.tags), [
    'docker.io/example/app:web-v1.2\ndocker.io/example/app:latest',
    'docker.io/example/proxy:alpine-v1.2',
    'docker.io/example/proxy:plus-v1.2\ndocker.io/example/proxy:latest',
    'docker.io/example/src:main-v1.2\ndocker.io/example/src:latest',
  ]);
  assert.equal(tagged.include.filter(x => x.tags.includes('proxy:latest')).length, 1, 'variants must not race for latest');
  for (const [o, publish, suffix] of [
    [{EVENT_NAME: 'pull_request', BASE_SHA: 'a', HEAD_SHA: 'b'}, false, 'ci'],
    [{EVENT_NAME: 'push', REF: 'refs/heads/feature', BASE_SHA: 'a', HEAD_SHA: 'b'}, false, 'ci'],
    [{EVENT_NAME: 'push', BASE_SHA: 'a', HEAD_SHA: 'b'}, true, 'nightly'],
    [{EVENT_NAME: 'schedule', FORCE: 'true'}, true, 'nightly'],
    [{EVENT_NAME: 'workflow_dispatch', PUBLISH: 'true', REF: 'refs/heads/feature', FORCE: 'true'}, false, 'ci'],
  ]) {
    const result = await plan(env(o), fakeIO(root, {overrides: {diff: ['proxy/alpine.env']}}));
    assert.equal(result.publish, publish, JSON.stringify(o));
    assert.ok(result.include.every(x => x.tags.endsWith(`-${suffix}`)), JSON.stringify(o));
  }
});

test('push and PR build only changed projects; CI edits and missing history build all', async t => {
  const root = tree(t, recipes);
  const pushed = await plan(env({EVENT_NAME: 'push', BASE_SHA: 'a', HEAD_SHA: 'b'}), fakeIO(root, {overrides: {diff: ['src/Dockerfile', 'README.md']}}));
  assert.deepEqual(pushed.include.map(x => `${x.id} ${x.reasons}`), ['src/main recipe changed']);
  assert.equal(pushed.include[0].no_cache, false);
  const docs = await plan(env({EVENT_NAME: 'push', BASE_SHA: 'a', HEAD_SHA: 'b'}), fakeIO(root, {overrides: {diff: ['README.md']}}));
  assert.deepEqual(docs.include, []);
  const git = {hasCommit: () => true, diff: () => ['ci/plan.mjs']};
  assert.equal(changedPaths({event: 'push', base: 'a', head: 'b'}, git), undefined);
  assert.equal(changedPaths({event: 'push', base: '0'.repeat(40), head: 'b'}, git), undefined);
  assert.throws(() => changedPaths({event: 'pull_request', base: 'a', head: 'b'}, {hasCommit: () => false}), /PR base commit is missing/);
  assert.throws(() => changedPaths({event: 'push', base: 'a', head: ''}, {hasCommit: () => true}), /HEAD_SHA is required/);
});

test('this repository\'s recipes are valid', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const variants = discover(root);
  assert.ok(variants.length > 0);
  for (const v of variants.filter(x => !x.source)) {
    const {images} = parseDockerfile(readFileSync(join(root, v.dockerfile), 'utf8'), v.buildArgs);
    assert.ok(images.length > 0, `${v.name}/${v.variant} has a base image`);
  }
});
