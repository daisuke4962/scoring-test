// Gather the three files that make up a release into one folder, so publishing an update is
// "drag this folder onto Netlify" and nothing else.
//
//   ScoringTest-Setup-<version>.exe   what a person installs
//   latest.yml                        how an installed copy learns there is a newer one
//   *.blockmap                        lets it download only the changed parts
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, 'release');
const to = join(from, 'upload');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

const wanted = readdirSync(from).filter(f => f === 'latest.yml' || f.endsWith('.exe') || f.endsWith('.blockmap'));
for (const f of wanted) copyFileSync(join(from, f), join(to, f));

const mb = (f) => (statSync(join(to, f)).size / 1024 / 1024).toFixed(1) + ' MB';
console.log('\nUpload this folder:  ' + to);
for (const f of wanted) console.log('  ' + f + '  (' + mb(f) + ')');
if (!wanted.includes('latest.yml')) console.log('\nlatest.yml is missing: installed copies will not see this version.');
