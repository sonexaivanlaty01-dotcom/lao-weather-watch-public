import assert from 'node:assert/strict';
import {chooseCloudSource,sourceLate,cloudSourceLabel,cloudTimelineTitle,KEEP_PRIMARY_MS,CLOUD_PRIMARY} from './dist/cloud-source.js';
const now=Date.parse('2026-10-09T07:30:00Z'),nasaFrames=[{time:'2026-10-09T06:50:00Z',provider:'nasa'}],awsFrames=[{time:'2026-10-09T07:10:00Z',provider:'aws',stamp:'202610090710'}];
let backupCalls=0;const ok={nasa:async()=>nasaFrames,backup:async()=>{backupCalls++;return awsFrames}},down={nasa:async()=>{throw new Error('gibs_down')},backup:ok.backup};
assert.equal(CLOUD_PRIMARY,'nasa');
// NASA is used whenever it answers, even when AWS would be newer; the backup is not contacted.
assert.deepEqual(await chooseCloudSource({provider:'aws',latest:awsFrames[0].time},ok,now),{source:'nasa',frames:nasaFrames});assert.equal(backupCalls,0);
assert.deepEqual(await chooseCloudSource({},ok,now),{source:'nasa',frames:nasaFrames});
// First load with NASA down: use the AWS backup.
assert.deepEqual(await chooseCloudSource({provider:'nasa'},down,now),{source:'aws',frames:awsFrames});assert.equal(backupCalls,1);
// Short NASA outage while NASA frames are recent: keep them (caller retains its frames) rather than switching.
await assert.rejects(chooseCloudSource({provider:'nasa',latest:new Date(now-KEEP_PRIMARY_MS+60000).toISOString()},down,now),/gibs_down/);assert.equal(backupCalls,1);
// Long outage: NASA frames too old to keep, switch to the backup.
assert.equal((await chooseCloudSource({provider:'nasa',latest:new Date(now-KEEP_PRIMARY_MS).toISOString()},down,now)).source,'aws');
// Already on the backup and NASA still down: stay on the backup.
assert.equal((await chooseCloudSource({provider:'aws',latest:awsFrames[0].time},down,now)).source,'aws');
// Both down: the error reaches the caller, which keeps whatever it already shows.
await assert.rejects(chooseCloudSource({},{nasa:down.nasa,backup:async()=>{throw new Error('aws_down')}},now),/aws_down/);
// Lateness thresholds follow each source's normal publication delay; times are never changed.
assert.equal(sourceLate('nasa','2026-10-09T06:50:00Z',now),false);assert.equal(sourceLate('nasa','2026-10-09T06:30:00Z',now),true);
assert.equal(sourceLate('aws','2026-10-09T07:10:00Z',now),false);assert.equal(sourceLate('aws','2026-10-09T07:00:00Z',now),true);
assert.equal(sourceLate('nasa','invalid',now),false);
assert.match(cloudSourceLabel('nasa'),/^NASA GIBS/);assert.match(cloudSourceLabel('aws'),/ສຳຮອງ/);assert.doesNotMatch(cloudSourceLabel('nasa'),/ສຳຮອງ/);
assert.equal(cloudTimelineTitle('nasa'),'Himawari · NASA');assert.match(cloudTimelineTitle('aws'),/AWS ສຳຮອງ/);
console.log('Cloud source checks passed: NASA GIBS primary, AWS backup only on long outages');
