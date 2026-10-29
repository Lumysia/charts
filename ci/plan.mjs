// Decides which image variants to build and how to tag them.
// Kept identical in every image repository that uses it; Node standard library only.
//
// A project is a directory with `<variant>.env` files. Each variant is built from the
// project's Dockerfile, or from the repository named in `external-git.txt`. Scheduled and
// manual runs build a variant only when something it depends on changed since the
// published image was built: the digest of an image in a FROM line, or the commit of an
// upstream git source. Those inputs are stored on the image in the INPUTS_LABEL label.
import {appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const INPUTS_LABEL = 'ci.build.inputs';
const CI_PATHS = ['.github/', '.forgejo/', 'ci/'];
const byName = (a, b) => a.localeCompare(b, 'en', {numeric: true});

export function parseEnvFile(text, file) {
  const args = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error(`${file}: expected KEY=VALUE, got "${line}"`);
    args[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const {PLATFORMS: platforms, ...buildArgs} = args;
  if (!platforms) throw new Error(`PLATFORMS is required in ${file}`);
  return {platforms: platforms.replace(/\s+/g, ''), buildArgs};
}

export function parseExternalGit(text, file) {
  const [repo = '', ref = ''] = text.split(/\r?\n/).map(l => l.trim());
  if (!repo) throw new Error(`${file} must name a git repository on its first line`);
  return {repo, ref};
}

/** Lists enabled variants: `<dir>/disabled` and `*.env.disabled` are skipped. */
export function discover(root) {
  const variants = [];
  const dirs = readdirSync(root, {withFileTypes: true})
    .filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name).sort(byName);
  for (const name of dirs) {
    const dir = join(root, name);
    if (existsSync(join(dir, 'disabled'))) continue;
    const envFiles = readdirSync(dir).filter(f => f.endsWith('.env')).sort(byName);
    if (!envFiles.length) continue;
    let recipe;
    if (existsSync(join(dir, 'Dockerfile'))) {
      recipe = {context: name, dockerfile: `${name}/Dockerfile`, source: null};
    } else if (existsSync(join(dir, 'external-git.txt'))) {
      const source = parseExternalGit(readFileSync(join(dir, 'external-git.txt'), 'utf8'), `${name}/external-git.txt`);
      recipe = {context: `external/${name}`, dockerfile: `external/${name}/Dockerfile`, source};
    } else {
      throw new Error(`${name} has variants but neither a Dockerfile nor external-git.txt`);
    }
    for (const file of envFiles) {
      const {platforms, buildArgs} = parseEnvFile(readFileSync(join(dir, file), 'utf8'), `${name}/${file}`);
      variants.push({
        name, variant: file.slice(0, -'.env'.length), platforms, buildArgs, ...recipe,
        readme: existsSync(join(dir, 'README.md')) ? `${name}/README.md` : '',
        last: file === envFiles.at(-1),
      });
    }
  }
  return variants;
}

function substitute(value, vars) {
  return value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?::?([-+])([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (_, braced, op, word, bare) => {
      const v = vars[braced ?? bare] ?? '';
      if (op === '-') return v || word;
      if (op === '+') return v ? word : '';
      return v;
    });
}

function argDeclarations(rest) {
  // ARG NAME, ARG NAME=default, ARG A=1 B="two"
  return [...rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)(?:=("[^"]*"|'[^']*'|\S*))?/g)]
    .map(([, key, value]) => [key, value?.replace(/^(["'])(.*)\1$/, '$2')]);
}

/**
 * Reads a Dockerfile the way BuildKit resolves FROM: only ARGs declared before the first
 * FROM are in scope, overridden by build args. Returns external images (stage references
 * and scratch excluded), the image the final stage is based on, and all ARG defaults.
 */
export function parseDockerfile(text, buildArgs = {}) {
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const scope = {}, defaults = {}, stages = new Map(), images = [];
  let seenFrom = false, final = null;
  for (const line of lines) {
    const [, instr, rest = ''] = line.match(/^(\S+)\s*(.*)$/);
    if (/^arg$/i.test(instr)) {
      for (const [key, value] of argDeclarations(rest)) {
        if (value !== undefined && !(key in defaults)) defaults[key] = value;
        if (!seenFrom) scope[key] = buildArgs[key] ?? (value === undefined ? '' : substitute(value, scope));
      }
    } else if (/^from$/i.test(instr)) {
      seenFrom = true;
      const words = rest.split(/\s+/).filter(w => !w.startsWith('--'));
      const ref = substitute(words[0] ?? '', scope);
      const alias = /^as$/i.test(words[1] ?? '') ? words[2]?.toLowerCase() : undefined;
      if (!ref) throw new Error(`FROM resolves to an empty image: "${line}"`);
      const base = stages.has(ref.toLowerCase()) ? stages.get(ref.toLowerCase()) : ref === 'scratch' ? null : ref;
      if (base && !stages.has(ref.toLowerCase()) && !images.includes(base)) images.push(base);
      if (alias) stages.set(alias, base);
      final = base;
    }
  }
  if (!seenFrom) throw new Error('Dockerfile has no FROM instruction');
  return {images, final, defaults};
}

/** Git sources passed as build args: `<P>_REPO=<git url>` with optional `<P>_REF`. */
export function gitArgSources(args) {
  return Object.entries(args)
    .filter(([key, value]) => key.endsWith('_REPO') && /^(https?:\/\/|ssh:\/\/|git@)/.test(value))
    .map(([key, repo]) => ({key: `git:${key.slice(0, -'_REPO'.length)}`, repo, ref: args[`${key.slice(0, -'_REPO'.length)}_REF`] ?? ''}))
    .sort((a, b) => byName(a.key, b.key));
}

/** Git paths changed between two commits, or undefined when every project must build. */
export function changedPaths({event, base, head}, git = gitCli) {
  if (!['push', 'pull_request'].includes(event) || !base || /^0+$/.test(base)) return undefined;
  if (!git.hasCommit(base)) {
    if (event === 'pull_request') throw new Error('PR base commit is missing; check out with full history');
    return undefined;
  }
  if (!head) throw new Error('HEAD_SHA is required for changed-project selection');
  const paths = git.diff(event === 'pull_request' ? [`${base}...${head}`] : [base, head]);
  return paths.some(p => CI_PATHS.some(ci => p.startsWith(ci))) ? undefined : paths;
}

export function settings(env) {
  const need = key => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} is required; set it as a repository Actions variable`);
    return value;
  };
  const registry = need('CONTAINER_REGISTRY').toLowerCase().replace(/\/+$/, '');
  const namespace = need('CONTAINER_NAMESPACE').toLowerCase();
  const event = env.EVENT_NAME ?? '';
  // The full ref is set for every event on both forges; ref_type is not always.
  const ref = env.REF ?? '';
  const isTag = ref.startsWith('refs/tags/');
  const refName = ref.replace(/^refs\/(heads|tags)\//, '');
  const isMain = ref === `refs/heads/${env.DEFAULT_BRANCH}`;
  const publish = ((event === 'push' || event === 'schedule') && (isMain || isTag)) ||
    (event === 'workflow_dispatch' && env.PUBLISH === 'true' && (isMain || isTag));
  // Scheduled and manual runs on the default branch compare inputs; everything else is explicit.
  const check = (event === 'schedule' || event === 'workflow_dispatch') && !isTag && env.FORCE !== 'true';
  const maxAgeDays = Number(env.MAX_AGE_DAYS || 0);
  if (check && !(maxAgeDays > 0)) throw new Error('MAX_AGE_DAYS must be a positive number of days');
  return {registry, namespace, event, isTag, refName, publish, check, maxAgeDays,
    project: env.PROJECT?.trim() ?? '', force: env.FORCE === 'true', base: env.BASE_SHA ?? '', head: env.HEAD_SHA ?? ''};
}

export function tagsFor(v, s) {
  const image = `${s.registry}/${s.namespace}/${v.name.toLowerCase()}`;
  if (s.publish && s.isTag) return [`${image}:${v.variant}-${s.refName}`, ...(v.last ? [`${image}:latest`] : [])];
  return [`${image}:${v.variant}-${s.publish ? 'nightly' : 'ci'}`];
}

const short = value => value.replace(/^sha256:/, '').slice(0, 12);

/** Resolves every input of a variant to an immutable id. Results are cached per run. */
export async function resolveInputs(v, io, cache = new Map()) {
  const once = (key, fn) => {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(fn));
    return cache.get(key);
  };
  const inputs = {};
  let source = null, dockerfile;
  if (v.source) {
    const sha = await once(`git ${v.source.repo} ${v.source.ref}`, () => io.gitResolve(v.source.repo, v.source.ref));
    source = {...v.source, sha};
    inputs['git:source'] = sha;
    dockerfile = await once(`file ${v.source.repo} ${sha}`, () => io.gitFile(v.source.repo, sha, 'Dockerfile'));
  } else {
    dockerfile = readFileSync(join(io.root, v.dockerfile), 'utf8');
  }
  const parsed = parseDockerfile(dockerfile, v.buildArgs);
  for (const image of parsed.images) {
    inputs[image] = image.includes('@') ? image.slice(image.indexOf('@') + 1) : await once(`image ${image}`, () => io.imageDigest(image));
  }
  for (const git of gitArgSources({...parsed.defaults, ...v.buildArgs})) {
    inputs[git.key] = await once(`git ${git.repo} ${git.ref}`, () => io.gitResolve(git.repo, git.ref));
  }
  return {inputs, source, final: parsed.final};
}

/** Explains why a published image is out of date; an empty list means it is current. */
export async function staleness(v, tag, resolved, s, io) {
  const published = await io.published(tag, v.platforms.split(',')[0]);
  if (!published) return [`${tag} is not published yet`];
  const reasons = [];
  let recorded;
  try { recorded = JSON.parse(published.labels?.[INPUTS_LABEL] ?? 'null'); } catch { recorded = null; }
  if (!recorded) {
    reasons.push(`${tag} has no ${INPUTS_LABEL} label`);
    if (resolved.final && !resolved.final.includes('@') && await io.baseChanged(tag, resolved.final, v.platforms.split(',')[0])) {
      reasons.push(`final base ${resolved.final} changed (layer comparison)`);
    }
  } else {
    for (const key of new Set([...Object.keys(recorded), ...Object.keys(resolved.inputs)])) {
      const [was, now] = [recorded[key], resolved.inputs[key]];
      if (was === now) continue;
      reasons.push(!was ? `new input ${key}` : !now ? `input ${key} removed` : `${key} ${short(was)} -> ${short(now)}`);
    }
  }
  const ageDays = (io.now() - Date.parse(published.created)) / 86400000;
  if (!(ageDays < s.maxAgeDays)) reasons.push(`last built ${Number.isFinite(ageDays) ? ageDays.toFixed(1) : '?'} days ago (max ${s.maxAgeDays})`);
  return reasons;
}

export async function plan(env, io) {
  const s = settings(env);
  let variants = discover(io.root);
  if (s.project) {
    variants = variants.filter(v => v.name === s.project);
    if (!variants.length) throw new Error(`No enabled variants for ${s.project}`);
  }
  const changed = s.isTag || s.check || s.project ? undefined : changedPaths(s, io.git);
  if (changed) variants = variants.filter(v => changed.some(p => p.startsWith(`${v.name}/`)));

  const cache = new Map(), include = [], skipped = [];
  for (const v of variants) {
    const tags = tagsFor(v, s);
    const resolved = await resolveInputs(v, io, cache);
    let reasons;
    if (s.force) reasons = ['forced'];
    else if (s.isTag) reasons = [`tag ${s.refName}`];
    else if (s.check) reasons = await staleness(v, `${s.registry}/${s.namespace}/${v.name.toLowerCase()}:${v.variant}-nightly`, resolved, s, io);
    else reasons = [changed ? 'recipe changed' : 'full build'];
    const id = `${v.name}/${v.variant}`;
    if (!reasons.length) { skipped.push(id); continue; }
    const buildArgs = {...v.buildArgs, ...(resolved.source ? {GIT_COMMIT: resolved.source.sha} : {})};
    include.push({
      id, name: v.name, variant: v.variant, platforms: v.platforms,
      context: v.context, dockerfile: v.dockerfile, readme: v.readme,
      image: `${s.registry}/${s.namespace}/${v.name.toLowerCase()}`,
      tags: tags.join('\n'),
      build_args: Object.entries(buildArgs).map(([k, val]) => `${k}=${val}`).join('\n'),
      labels: `${INPUTS_LABEL}=${JSON.stringify(Object.fromEntries(Object.entries(resolved.inputs).sort()))}`,
      source_repo: resolved.source?.repo ?? '', source_sha: resolved.source?.sha ?? '',
      // Builds triggered by upstream changes must not reuse cached RUN steps that fetch sources.
      no_cache: s.check || s.force,
      reasons: reasons.join('; '),
    });
  }
  return {publish: s.publish, include, skipped};
}

export function summary(result) {
  const lines = [`publish: ${result.publish}`];
  for (const x of result.include) lines.push(`build ${x.id}: ${x.reasons}`);
  for (const id of result.skipped) lines.push(`skip  ${id}: inputs unchanged`);
  return lines.join('\n');
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts}).trim();

const gitCli = {
  hasCommit: sha => { try { run('git', ['cat-file', '-e', `${sha}^{commit}`]); return true; } catch { return false; } },
  diff: range => run('git', ['diff', '--name-only', '-z', ...range, '--']).split('\0').filter(Boolean),
};

export function liveIO(root, env) {
  return {
    root, git: gitCli, now: () => Date.now(),
    imageDigest: image => run('regctl', ['image', 'digest', image]),
    async gitResolve(repo, ref) {
      if (/^[0-9a-f]{40}$/.test(ref)) return ref;
      if (ref === 'latest-release') {
        const path = repo.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
        if (!path) throw new Error(`latest-release is only supported for github.com repositories: ${repo}`);
        const headers = {accept: 'application/vnd.github+json', ...(env.GITHUB_API_TOKEN ? {authorization: `Bearer ${env.GITHUB_API_TOKEN}`} : {})};
        const res = await fetch(`https://api.github.com/repos/${path}/releases/latest`, {headers});
        if (!res.ok) throw new Error(`latest release of ${path}: HTTP ${res.status}`);
        ref = (await res.json()).tag_name;
      }
      const refs = new Map(run('git', ['ls-remote', repo, ...(ref ? [ref] : ['HEAD'])]).split('\n').filter(Boolean)
        .map(l => l.split('\t').reverse()));
      const sha = ref ? refs.get(`refs/tags/${ref}^{}`) ?? refs.get(`refs/tags/${ref}`) ?? refs.get(`refs/heads/${ref}`) : refs.get('HEAD');
      if (!sha) throw new Error(`git ref "${ref || 'HEAD'}" not found in ${repo}`);
      return sha;
    },
    gitFile(repo, sha, path) {
      const dir = mkdtempSync(join(env.TMPDIR || tmpdir(), 'plan-git-'));
      try {
        run('git', ['init', '-q', dir]);
        run('git', ['-C', dir, 'fetch', '-q', '--depth=1', '--filter=blob:none', repo, sha]);
        return run('git', ['-C', dir, 'show', `${sha}:${path}`]);
      } finally { rmSync(dir, {recursive: true, force: true}); }
    },
    published(ref, platform) {
      let out;
      try { out = run('regctl', ['image', 'config', ref, '--platform', platform, '--format', '{{json .}}']); } catch (e) {
        if (/not found|MANIFEST_UNKNOWN|unauthorized/i.test(String(e.stderr))) return null;
        throw e;
      }
      const config = JSON.parse(out);
      return {created: config.created, labels: config.config?.Labels ?? {}};
    },
    baseChanged(ref, base, platform) {
      try { run('regctl', ['image', 'check-base', ref, '--base', base, '--platform', platform, '--quiet']); return false; } catch { return true; }
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env;
  const result = await plan(env, liveIO(process.cwd(), env));
  console.error(summary(result));
  console.log(JSON.stringify(result));
  const out = env.GITHUB_OUTPUT || env.FORGEJO_OUTPUT;
  if (out) {
    const matrix = JSON.stringify({include: result.include});
    appendFileSync(out, `publish=${result.publish}\nhas_builds=${result.include.length > 0}\nmatrix=${matrix}\n`);
  }
  const summaryFile = env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, `\`\`\`\n${summary(result)}\n\`\`\`\n`);
}
