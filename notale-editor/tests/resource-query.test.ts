import {test} from 'node:test';import assert from 'node:assert/strict';import {rebaseUrl} from '../src/domain/urls.js';import {references} from '../src/domain/resources.js';
test('query-only references resolve to their source page and retain fragments when moved',()=>{
 assert.equal(references('pages/one.html','<a href="?mode=review#note">Review</a>','html')[0].path,'pages/one.html');
 const moved=rebaseUrl('?mode=review#note','pages/one.html','nested/two.html');
 assert.equal(moved,'../pages/one.html?mode=review#note');
 assert.equal(new URL(moved,'https://example.test/nested/two.html').href,new URL('?mode=review#note','https://example.test/pages/one.html').href);
 assert.equal(rebaseUrl('#note','pages/one.html','nested/two.html'),'#note');
 assert.equal(rebaseUrl('image.png?size=2#crop','pages/one.html','nested/deep/two.html'),'../../pages/image.png?size=2#crop');
});
