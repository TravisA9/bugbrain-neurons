'use strict';
/* Project order for one worker. SpikeFoundry is ahead of BugBrain when both are eligible.
 * A running lease is not in the candidate list (the caller already removed active claims).
 * Missing projects.json keeps the old job order. */
const fs = require('fs'), path = require('path');

const DEFAULTS = [
  { id: 'spikefoundry', title: 'SpikeFoundry', enabled: true, priority: 2, summary: 'Synthetic SNN design proposals. Not BugBrain accuracy.' },
  { id: 'bugbrain', title: 'BugBrain neurons', enabled: true, priority: 1, summary: 'Existing reading and generation tests.' },
];

function projectOf(job) {
  if (job.project) return job.project;
  if (job.kind === 'spikefoundry') return 'spikefoundry';
  return 'bugbrain';
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function readProjects(dir) {
  const doc = readJson(path.join(dir, 'projects.json'));
  if (!doc) return null;
  const list = Array.isArray(doc.projects) ? doc.projects : [];
  return list.map(p => ({ id: String(p.id), title: p.title || p.id, enabled: p.enabled !== false, priority: +p.priority || 0, summary: p.summary || '' }));
}
function readParticipant(dir, name) {
  if (!name) return null;
  return readJson(path.join(dir, 'participants', name + '.json'));
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function eligible(job, participant, fileExists) {
  const project = projectOf(job);
  if (!fileExists) return project !== 'spikefoundry';
  if (!participant || participant.donate !== true || participant.pause === true) return false;
  const allow = participant.allowedProjects || [];
  if (allow.indexOf(project) < 0) return false;
  const caps = participant.capabilities || {};
  if (caps[project] === false) return false;
  if (project === 'spikefoundry' && participant.maxBatches != null && (+job.batches || 1) > +participant.maxBatches) return false;
  return true;
}

function choose(jobs, projects, participant, fileExists) {
  if (!projects) return jobs.filter(j => projectOf(j) !== 'spikefoundry');
  return prefer(jobs, projects, participant, fileExists);
}
function prefer(jobs, projects, participant, fileExists) {
  if (!projects) return jobs.slice();
  const enabled = projects.filter(p => p.enabled).sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  for (const project of enabled) {
    const group = jobs.filter(j => projectOf(j) === project.id && eligible(j, participant, fileExists));
    if (group.length) return group;
  }
  return [];
}

function explain(choice, projects) {
  if (!projects) return 'No project list. Existing BugBrain order is unchanged. SpikeFoundry jobs are not claimed until a project list and an opt-in exist.';
  if (!choice.length) return 'Nothing this participant is allowed to run. A running lease, if any, is left alone.';
  const project = projectOf(choice[0]);
  const mine = projects.find(p => p.id === project);
  const ahead = projects.filter(p => p.enabled && mine && p.priority > mine.priority).map(p => p.id);
  let text = project + ' is what this computer would take next.';
  if (ahead.length) text += ' ' + ahead.join(', ') + ' stays ahead when it has a job this computer is allowed to run. It has none right now.';
  return text;
}

module.exports = { DEFAULTS, projectOf, readProjects, readParticipant, writeJson, eligible, prefer, choose, explain };
