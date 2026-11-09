import fs from 'node:fs';
export function workflowJob(name) {
  const text = fs.readFileSync('.github/workflows/validaciones-manuales.yml', 'utf8');
  const lines = text.split('\n');
  const start = lines.indexOf('  ' + name + ':');
  if (start < 0) throw new Error('Missing manual job ' + name);
  let end = start + 1;
  while (end < lines.length && !/^  [\w-]+:$/.test(lines[end])) end++;
  return text.split('\njobs:\n')[0] + '\njobs:\n' + lines.slice(start, end).join('\n') + '\n';
}
