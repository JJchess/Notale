#!/usr/bin/env node
import { pythonInteger } from "../core/json.js";
import { parseArgs, type ParseArgsConfig } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkCommand } from "./check.js";
import { mkdir } from "node:fs/promises";
import { baselineRuntime } from "../core/baseline-pipeline.js";
import { planRun, buildRun } from "../core/orchestration.js";
import { resolveBuilderProfile } from "../adapters/models/profiles.js";
import { generationScriptFor } from "../tools/media-execution.js";
import { checkOptions } from "../core/theme.js";
import { acquireVisualChecker } from "../tools/visual-check.js";
import { loadConfig } from "../adapters/models/profiles.js";
import type { PipelineOptions } from "../core/baseline-pipeline.js";
import { createApp } from "../server/app.js";
import { createRunRequestSchema } from "../protocol/index.js";
import { RunStore } from "../core/run-store.js";
import { RunService } from "../core/run-service.js";
import { starterPipeline } from "../core/starter-pipeline.js";
import { createModelPipeline } from "../core/model-pipeline.js";
import { LectureExports } from '../server/lecture-exports.js';

const command = process.argv[2] ?? "help";
const argv = process.argv.slice(3);

function runsRoot(value?: string): string {
  return path.resolve(value ?? process.env.NOTALE_RUNS_ROOT ?? "runs");
}

function integerArgument(value: string, option: string): number {
  try { return pythonInteger(value); }
  catch { throw new Error(`--${option} requires an integer`); }
}

export function buildArguments(args: string[], stage: 'plan' | 'build' = 'build') {
  const options = {
    label: { type: 'string' }, only: { type: 'string', multiple: true },
    query: { type: 'string', short: 'q' }, minutes: { type: 'string', default: '90' },
    audience: { type: 'string', default: '学过一点相关基础、但没系统学过这个题目的读者' },
    scenario: { type: 'string', default: '' }, style: { type: 'string' },
    runs: { type: 'string' }, starter: { type: 'boolean', default: false },
    profile: { type: 'string' }, uniform: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '100' }, samples: { type: 'string', default: 'mini' },
    notes: { type: 'string', default: 'cap' }, 'sample-shots': { type: 'boolean', default: false },
    'visual-focus': { type: 'boolean', default: false }, 'aux-samples': { type: 'boolean' }, 'no-aux-samples': { type: 'boolean' },
    'style-director': { type: 'boolean' }, 'no-style-director': { type: 'boolean' }, template: { type: 'string' },
    skills: { type: 'string' }, workflows: { type: 'string' }, prompts: { type: 'string' }, chassis: { type: 'string' }, lib: { type: 'string' },
    model: { type: 'string' }, effort: { type: 'string' }, 'base-url': { type: 'string' }, 'key-env': { type: 'string' }, wire: { type: 'string' },
    config: { type: 'string' }, 'env-file': { type: 'string' },
  } satisfies NonNullable<ParseArgsConfig['options']>;
  // argparse treats a negative numeric token as an option value. Node requires
  // the attached form even when the preceding option explicitly takes a string.
  const normalized: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--') { normalized.push(...args.slice(index)); break; }
    const option = Object.entries(options).find(([name, definition]) =>
      arg === '--' + name || ('short' in definition && arg === '-' + definition.short));
    const next = args[index + 1];
    if (option?.[1].type === 'string' && next !== undefined && /^-(?:\p{Nd}+|\p{Nd}*\.\p{Nd}+)$/u.test(next)) {
      normalized.push('--' + option[0] + '=' + next); index++;
    } else normalized.push(arg);
  }
  const { values, tokens } = parseArgs({ args: normalized, tokens: true, options });
  if (!['mini', 'none'].includes(values.samples)) throw new Error('--samples must be mini or none');
  if (!['off', 'cap', 'notes', 'only'].includes(values.notes)) throw new Error('--notes must be off, cap, notes or only');
  const concurrency = integerArgument(values.concurrency, 'concurrency');
  const toggle = (name: string, fallback: boolean) => {
    let result = fallback;
    for (const token of tokens) if (token.kind === 'option') {
      if (token.name === name) result = true;
      else if (token.name === 'no-' + name) result = false;
    }
    return result;
  };
  if (values.only && (stage === 'plan' || !values.label)) throw new Error('--only requires build --label');
  if (stage === 'plan' && !values.label) throw new Error('plan requires --label');
  if (values.wire && !['chat', 'messages', 'responses'].includes(values.wire)) throw new Error('--wire must be chat, messages or responses');
  if (stage !== 'plan' && [values.model, values.effort, values['base-url'], values['key-env'], values.wire].some(value => value !== undefined)) throw new Error('Planner model overrides require the plan command; use --profile for Builder');
  if (stage === 'plan' || !values.label) {
    checkOptions(values.template !== undefined ? path.resolve(values.template) : undefined, values.style, toggle('style-director', true));
  }
  if (values.skills !== undefined) generationScriptFor(values.skills);
  const pipeline: PipelineOptions = {
    ...(values.skills !== undefined ? { skillsRoot: path.resolve(values.skills) } : {}),
    ...(stage === 'plan' ? { planner: { ...(values.model ? { model: values.model } : {}), ...(values.effort ? { effort: values.effort } : {}), ...(values['base-url'] ? { baseUrl: values['base-url'] } : {}), ...(values['key-env'] ? { keyEnv: values['key-env'] } : {}), ...(values.wire ? { wire: values.wire } : {}) } } : {}),
    uniform: values.uniform, styleDirector: toggle('style-director', true),
    ...(values.profile ? { profile: values.profile } : {}), ...(values.template !== undefined ? { template: path.resolve(values.template) } : {}),
    ...(values.config ? { config: loadConfig(values.config) } : {}), ...(values['env-file'] ? { envFile: path.resolve(values['env-file']) } : {}),
    ...(values.chassis ? { chassis: path.resolve(values.chassis) } : {}), ...(values.lib ? { lib: path.resolve(values.lib) } : {}),
    build: { ...(values.only ? { only: values.only } : {}), samples: values.samples, notes: values.notes, concurrency,
      sampleShots: values['sample-shots'], visualFocus: values['visual-focus'], includeAux: toggle('aux-samples', values.samples !== 'none'),
      ...(values.workflows ? { workflowRoot: path.resolve(values.workflows) } : {}), ...(values.prompts ? { prompts: path.resolve(values.prompts) } : {}),
    },
  };
  const request = createRunRequestSchema.parse({ query: values.query ?? (stage === 'build' && values.label ? '(planned run)' : undefined), minutes: integerArgument(values.minutes, 'minutes'), audience: values.audience, scenario: values.scenario, style: values.style });
  return { request, pipeline, runs: runsRoot(values.runs), starter: values.starter, label: values.label };
}

async function main(): Promise<void> {
  if (command === "serve") {
    const { values } = parseArgs({ args: argv, options: { host: { type: "string", default: "127.0.0.1" }, port: { type: "string", default: "4321" }, runs: { type: "string" }, starter: { type: "boolean", default: false } } });
    const { app } = createApp({ runsRoot: runsRoot(values.runs), useStarterPipeline: values.starter });
    const address = await app.listen({ host: values.host, port: Number(values.port) });
    process.stdout.write(`Notale API listening at ${address}\n`);
    return;
  }
  if (command === "plan" || (command === "build" && argv.some(arg => arg === '--label' || arg.startsWith('--label=')))) {
    const { request, pipeline, runs, label, starter } = buildArguments(argv, command);
    if (!label) throw new Error('A separate stage requires --label');
    if (starter) throw new Error('--starter is only supported for complete demo runs');
    const root = path.resolve(runs, label);
    if (command === 'plan') {
      checkOptions(pipeline.template, request.style || undefined, pipeline.styleDirector ?? true);
      // mkdir without recursive guarantees an existing plan is never overwritten.
      await mkdir(path.dirname(root), { recursive: true });
      await mkdir(root);
    }
    const release = acquireVisualChecker();
    try {
      const runtime = baselineRuntime(root, pipeline);
      if (command === 'plan') {
        const { style, ...planning } = request;
        const result = await planRun({ root, ...planning, ...(style ? { style } : {}), styleDirector: pipeline.styleDirector ?? true,
          ...(pipeline.template ? { template: pipeline.template } : {}),
          ...(pipeline.build?.prompts ? { prompts: pipeline.build.prompts } : {}),
          ...(pipeline.build?.workflowRoot ? { workflowRoot: pipeline.build.workflowRoot } : {}),
          visualFocus: pipeline.build?.visualFocus ?? false,
        }, runtime, { ...(pipeline.chassis ? { chassis: pipeline.chassis } : {}), ...(pipeline.lib ? { lib: pipeline.lib } : {}) });
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        const pages = await buildRun(root, runtime.builders, { ...pipeline.build, label,
          profile: resolveBuilderProfile(runtime.cfg, pipeline.profile, runtime.env),
          profiles: Object.fromEntries(Object.entries(runtime.models.builders).map(([name, model]) => [name, model.profile])),
        });
        process.stdout.write(JSON.stringify({ root, pages: pages.length, artifacts: pages.filter(page => page.artifact_present).length }) + '\n');
      }
    } finally { await release(); }
    return;
  }
  if (command === "build") {
    const { request, pipeline, runs, starter } = buildArguments(argv);
    const store = new RunStore(runs);
    const service = new RunService(store, starter ? starterPipeline : createModelPipeline(pipeline));
    const exports = new LectureExports(service);
    const run = await service.start(request);
    for (;;) {
      const current = await store.get(run.id);
      if (["completed", "failed", "cancelled"].includes(current.status)) {
        process.stdout.write(`${JSON.stringify(current)}\n`);
        process.exitCode = current.status === "completed" ? 0 : 1;
        if (current.status === 'completed') {
          try { await exports.ensure(run.id); }
          catch (error) { process.stderr.write(`讲义已生成，但 .notale 打包失败：${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (command === "check") {
    process.exitCode = await checkCommand(argv);
    return;
  }
  if (command === "inspect") {
    const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { runs: { type: "string" } } });
    const id = positionals[0];
    if (!id) throw new Error("Usage: notale inspect <run-id>");
    const store = new RunStore(runsRoot(values.runs));
    process.stdout.write(`${JSON.stringify({ run: await store.get(id), events: await store.events(id) }, null, 2)}\n`);
    return;
  }
  process.stdout.write("Usage: notale <serve|plan|build|check|inspect> [options]\nCheck: [page-*.html ...] [--after JS ...] [--shot] [--shot-dir PATH] [--crop X,Y,W,H] [--zoom 2] [--wait 1200] [--text-report] [--json]\nStages: plan --label NAME --query TEXT; build --label NAME [--only page-01 ...]\nPlanner: [--model NAME] [--effort VALUE] [--base-url URL] [--key-env ENV] [--wire chat|messages|responses]\nBuild: --query TEXT [--minutes 90] [--profile NAME] [--uniform] [--samples mini|none]\n       [--notes off|cap|notes|only (default cap: cover 80, page/interaction 200)]\n       [--sample-shots] [--visual-focus] [--[no-]aux-samples]\n       [--concurrency 100] [--[no-]style-director] [--template PATH]\n       [--skills PATH] [--workflows PATH] [--prompts PATH] [--chassis PATH] [--lib PATH] [--config PATH] [--env-file PATH]\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
