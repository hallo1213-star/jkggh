// Version control for the Self-Evolution Engine.
// On Render the running code comes from GitHub (auto-deploy from the branch),
// so a change becomes the "main version" by a commit on GitHub. Uses the
// official GitHub REST API (no git binary needed on the server).
//   GITHUB_TOKEN  – fine-grained token, ONLY this repository, permission
//                   "Contents: Read and write" (nothing else needed)
//   GITHUB_REPO   – "owner/name" (e.g. hallo1213-star/jarvis)
//   GITHUB_BRANCH – default "main" (the branch Render deploys)
// Rollback = a NEW commit that restores the files of the last good version
// (history stays complete, no force push).
// Without a token: proposals, tests and the patch work; adopting is then a
// manual step (the dashboard offers the patch as a download).
const API = 'https://api.github.com';

export function gitConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  return { enabled: Boolean(token && /^[\w.-]+\/[\w.-]+$/.test(repo || '')), repo: repo || '', branch: process.env.GITHUB_BRANCH?.trim() || 'main', deployedCommit: process.env.RENDER_GIT_COMMIT?.trim() || '' };
}

async function gh(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Jarvis-Self-Evolution', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || `Status ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new Error(`GitHub lehnt den Zugriff ab (${message}). Token und Berechtigung „Contents: Read and write“ prüfen.`);
    throw new Error(`GitHub: ${message}`);
  }
  return data;
}

export async function headCommit({ fetchImpl } = {}) {
  const { repo, branch } = gitConfig();
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { fetchImpl });
  return ref.object.sha;
}

export async function fileAt(path, sha, { fetchImpl } = {}) {
  const { repo } = gitConfig();
  try {
    const data = await gh(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, { fetchImpl });
    return Buffer.from(data.content || '', 'base64').toString('utf8');
  } catch (error) {
    if (/Not Found/i.test(error.message)) return null;
    throw error;
  }
}

// files: Map path → new content (string) or null (delete). Commits on top of
// `parent` and moves the branch – only as a fast-forward (never overwrites
// commits someone else made meanwhile).
export async function commitFiles(files, message, { parent, fetchImpl } = {}) {
  const { repo, branch } = gitConfig();
  const base = parent || await headCommit({ fetchImpl });
  const baseCommit = await gh(`/repos/${repo}/git/commits/${base}`, { fetchImpl });
  const tree = [];
  for (const [path, content] of files) {
    if (content === null) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    else {
      const blob = await gh(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: Buffer.from(content).toString('base64'), encoding: 'base64' }, fetchImpl });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }
  const newTree = await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree }, fetchImpl });
  const commit = await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: { message, tree: newTree.sha, parents: [base], author: { name: 'Jarvis Self-Evolution', email: 'jarvis-evolution@users.noreply.github.com', date: new Date().toISOString() } }, fetchImpl });
  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.sha, force: false }, fetchImpl });
  return { sha: commit.sha, parent: base, url: `https://github.com/${repo}/commit/${commit.sha}` };
}

// Makes sure the files Jarvis changed are still exactly what he based his work
// on (nobody changed them on GitHub in the meantime).
export async function verifyBase(originals, { fetchImpl } = {}) {
  const head = await headCommit({ fetchImpl });
  const conflicts = [];
  for (const [path, content] of originals) {
    const remote = await fileAt(path, head, { fetchImpl });
    if (remote !== content && !(remote === null && content === null)) conflicts.push(path);
  }
  return { head, conflicts };
}

// Restores the given files to their content at `goodSha` as a new commit.
export async function restoreFiles(paths, goodSha, message, { fetchImpl } = {}) {
  const files = new Map();
  for (const path of paths) files.set(path, await fileAt(path, goodSha, { fetchImpl }));
  return commitFiles(files, message, { fetchImpl });
}
