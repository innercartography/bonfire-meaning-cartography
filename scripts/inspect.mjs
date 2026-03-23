import { readFileSync } from 'fs';
const concepts = JSON.parse(readFileSync('./public/data/concepts.json','utf8'));
console.log('=== CONCEPTS ===');
concepts.forEach(c => console.log(`${c.label} | ${c.category} | ${c.mention_count} mentions`));
console.log(`\nTotal: ${concepts.length}`);

const clusters = JSON.parse(readFileSync('./public/data/clusters.json','utf8'));
console.log('\n=== CLUSTERS ===');
clusters.forEach(c => console.log(`${c.id} | ${c.label} | ${c.artifact_ids.length} msgs | ${c.time_span.start}-${c.time_span.end}`));
console.log(`\nTotal: ${clusters.length}`);

const actors = JSON.parse(readFileSync('./public/data/actors.json','utf8'));
console.log('\n=== TOP ACTORS ===');
actors.slice(0,15).forEach(a => console.log(`${a.display_name} | ${a.actor_kind} | ${a.message_count} msgs | labels: ${a.labels.join(', ')}`));
