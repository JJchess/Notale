import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContentPack, validateSectionHtml } from '../src/contracts.mjs';

function validPack() {
  return {
    version: '2.0',
    title: '测试',
    sources: [{
      id: 'src-01',
      path: 'material.md',
      sha256: 'a'.repeat(64),
    }],
    pages: [{
      id: 'page-001',
      title: '一页',
      purpose: '验证语义契约',
      claims: [{ text: '事实', sourceIds: ['src-01'] }],
      graph: {
        nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        edges: [{ from: 'a', to: 'b' }],
      },
    }],
  };
}

test('content-pack 接受合法语义与真实邻接', () => {
  assert.equal(validateContentPack(validPack()).pages.length, 1);
});

test('content-pack 拒绝指向不存在节点的边', () => {
  const pack = validPack();
  pack.pages[0].graph.edges[0].to = 'missing';
  assert.throws(() => validateContentPack(pack), /不存在节点/);
});

test('content-pack 拒绝呈现字段渗入语义页', () => {
  const pack = validPack();
  pack.pages[0].layout = 'two-column';
  assert.throws(() => validateContentPack(pack), /语义\/呈现边界/);
});

test('页面契约拒绝脚本和未隔离 CSS', () => {
  assert.throws(
    () => validateSectionHtml('<section data-page-id="page-001"><style>h1{color:red}</style></section>', 'page-001'),
    /未按页面 scope 隔离/,
  );
  assert.throws(
    () => validateSectionHtml('<section data-page-id="page-001"><style>[data-page-id="page-001"]{color:red}</style><script></script></section>', 'page-001'),
    /禁止 <script>/,
  );
  assert.throws(
    () => validateSectionHtml('<section data-page-id="page-001"><style>[data-page-id="page-001"]{color:red} h2{font-size:30px}</style></section>', 'page-001'),
    /未按页面 scope 隔离/,
  );
});
