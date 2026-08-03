import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryRequest, projectFromQuery } from '../src/query-pipeline.mjs';

test('query 入口只从一个字符串解析主题、页数和附加要求', () => {
  const query = '数据结构：线性部分和半线性部分。生成36页中文课程讲义；明确半线性是课程操作性口径。';
  const request = parseQueryRequest(query);
  assert.equal(request.topic, '数据结构：线性部分和半线性部分');
  assert.equal(request.pageCount, 36);
  assert.equal(request.language, 'zh-CN');
  const project = projectFromQuery(query);
  assert.deepEqual(project.materials, []);
  assert.equal(project.contentPlanning.instructions, query);
  assert.equal(project.contentPlanning.pageCount, 36);
  assert.equal(project.contentPlanning.requireVisualDirection, true);
  assert.equal(project.contentPlanning.research.seedQueries, undefined);
  assert.equal(project.providers.content.mode, 'research-planner');
  assert.equal(project.providers.reference.mode, 'openrouter-image');
  assert.equal(project.providers.reference.model, 'openai/gpt-image-2');
  assert.equal(project.providers.reference.apiKeyEnv, 'OPENROUTER_API_KEY');
  assert.equal(project.providers.content.model, 'deepseek-ai/DeepSeek-V4-Flash');
  assert.equal(project.providers.content.apiKeyEnv, 'SILCONFLOW_API_KEY');
  assert.equal(project.providers.content.baseUrl, 'https://api.siliconflow.cn/v1');
  assert.equal(project.providers.reference.aspectRatio, '16:9');
  assert.equal(project.providers.reference.quality, 'high');
  assert.equal(project.providers.reference.preflight, true);
  assert.equal(project.contentPlanning.pageContractConcurrency, 4);
});

test('query 未写页数时使用固定默认值，不向调用者索取项目配置', () => {
  const project = projectFromQuery('遗传学定律');
  assert.equal(project.contentPlanning.pageCount, 12);
  assert.match(project.goal, /遗传学定律/);
});

test('query 中的学段要求直接进入页面设计受众，不需要额外配置', () => {
  const project = projectFromQuery('面向小学三年级讲解太阳系，生成8页课程讲义');
  assert.match(project.audience, /小学低年级/);
  assert.equal(project.visualPlanning.sceneExpertSystem.enabled, true);
  assert.equal(project.visualPlanning.sceneExpertSystem.routing, 'content-and-audience');
});
