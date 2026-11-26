import path from 'node:path';

// Development keeps existing data in place; packaged builds can select a writable per-user directory.
export function managerPaths(directory, dataRoot) {
  if (dataRoot !== undefined && (!dataRoot || !path.isAbsolute(dataRoot))) throw new Error('WebAppMaker data directory must be an absolute path.');
  const data = dataRoot ? path.resolve(dataRoot) : directory;
  return { storage: path.join(data, 'builds.local'), addonRoot: path.join(data, 'addons.local') };
}
