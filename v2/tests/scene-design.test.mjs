import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneDesign, inferAudienceProfile, selectSceneExpert } from '../src/scene-design.mjs';

test('学段路由从单一 query 推断页面密度与年龄适配', () => {
  const profile = inferAudienceProfile({
    title: '孟德尔遗传规律',
    audience: '高中一年级学习者与授课教师',
    contentPlanning: { instructions: '面向高一学生生成12页课程讲义' },
  });
  assert.equal(profile.id, 'high-school');
  assert.equal(profile.density, 'medium');
  assert.match(profile.adaptation, /机制、推导和实验变量/);
});

test('页面场景专家按视觉任务而不是主题风格路由', () => {
  assert.equal(selectSceneExpert({ title: '用测交检验基因型', purpose: '实验变量与观察结果', contentKind: 'process' }, { index: 2, total: 8 }), 'scientific-schematic');
  assert.equal(selectSceneExpert({ title: '推导分离比', purpose: '使用概率公式完成推导' }, { index: 3, total: 8 }), 'math-derivation');
  assert.equal(selectSceneExpert({ title: '马孔多的时间结构', purpose: '文学叙事与人物记忆' }, { index: 2, total: 8 }), 'humanities-editorial');
  assert.equal(selectSceneExpert({ title: '课堂练习', purpose: '选择题作答' }, { index: 5, total: 8 }), 'exercise-activity');
});

test('页面设计契约保留高自由设计但锁住语义精度边界', () => {
  const scene = buildSceneDesign({
    page: { title: '实验结果', purpose: '比较不同处理的统计结果', series: [{ label: 'A', value: 10 }] },
    project: { audience: '大学本科生' },
    contentPack: {}, index: 3, total: 10,
  });
  assert.equal(scene.expertId, 'quantitative-figure');
  assert.equal(scene.precisionMode, 'deterministic-truth-first');
  assert.match(scene.truthBoundary, /真实数据/);
  assert.match(scene.designFreedom, /自主选择视觉隐喻/);
});
