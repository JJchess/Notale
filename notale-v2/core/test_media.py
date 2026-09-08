"""Image delivery contracts, not aesthetic or budget gates."""
import copy
import json
import io
import socket
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from PIL import Image

from core import code_runtime, image_search, media, planner, tools

PAGES = '# page-01 [标题页]\n开场\n\n# page-02 [内容页]\n算法的提出背景\n'


def call(name, **args):
    values = dict(type='function_call', name=name, arguments=json.dumps(args), call_id=name)
    return SimpleNamespace(**values, model_dump=lambda **_: values)


def response(*calls):
    return SimpleNamespace(output=list(calls), usage=None, id='test-response')


def search_output(rows, errors=None, images=None):
    return tools.Out(json.dumps({'results': rows, 'errors': errors or []}), images or [])


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pages = self.root / 'pages'
        self.pages.mkdir()
        self.backend = patch.object(media, 'search_backend', return_value='gemini')
        self.backend.start()
        self.addCleanup(self.backend.stop)
        self.run = SimpleNamespace(root=self.root, pages=self.pages, style_director=True,
                                   log=SimpleNamespace(add=lambda *args: None), query='test',
                                   prompt=lambda *a, **kw: '本页任务')

    def image(self, relative):
        target = self.pages / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.new('RGB', (32, 32), 'blue').save(target)
        return target

    def fake_search(self, query, count, out):
        Image.new('RGB', (32, 32), 'blue').save(out / 'photo.jpg')
        return [{'file': 'photo.jpg', 'title': 'photo', 'page_url': 'https://example.org/photo',
                 'source': 'gemini-google-search', 'license': 'CC0'}], []

    def fake_vendor(self, cmd, **kwargs):
        out = Path(cmd[cmd.index('--out') + 1])
        Image.new('RGB', (32, 32), 'blue').save(out)
        (out.parent / 'illustrations.json').write_text(json.dumps([
            {'file': out.name, 'model': 'test', 'prompt': 'test'}]))
        return SimpleNamespace(returncode=0, stdout='', stderr='')

    def test_shared_fetch_returns_images_and_provenance_in_private_paths(self):
        with patch.object(image_search, 'search', self.fake_search), patch.object(media.subprocess, 'run', self.fake_vendor):
            a = tools.media_call('ImageSearch', {'query': 'object'}, self.pages, 'planner')
            b = tools.run('ImageGen', {'prompt': 'scene'}, self.pages, None, 'page-02')
        paths = [json.loads(a.text)['results'][0]['path'], json.loads(b.text)[0]['path']]
        self.assertTrue(paths[0].startswith('assets/img/planner-'))
        self.assertTrue(paths[1].startswith('assets/img/page-02-'))
        self.assertTrue(a.images and b.images)
        self.assertEqual(set(media.sources(self.pages)), set(paths))
        media.write_credits(self.pages)
        credits = (self.pages / 'assets/img/CREDITS.md').read_text()
        self.assertIn('未采用候选', credits)
        self.assertIn('https://example.org/photo', credits)

    def test_parallel_fetches_do_not_overwrite_or_append_shared_files(self):
        with patch.object(image_search, 'search', self.fake_search):
            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(lambda _: tools.media_call('ImageSearch', {'query': 'object'},
                                                                  self.pages, 'page-02'), range(5)))
        paths = [json.loads(r.text)['results'][0]['path'] for r in results]
        self.assertEqual(len(set(paths)), 5)
        self.assertFalse((self.pages / 'assets/img/CREDITS.md').exists())
        media.write_credits(self.pages)
        self.assertTrue(all(path in (self.pages / 'assets/img/CREDITS.md').read_text() for path in paths))

    def test_invalid_image_is_not_returned_as_usable(self):
        out = self.pages / 'assets/img/planner-bad'
        out.mkdir(parents=True)
        bad = out / 'bad.jpg'
        bad.write_text('not an image')
        with patch.object(media, 'fetch', return_value=(out, [{'path': bad.relative_to(self.pages).as_posix()}], [])):
            result = tools.media_call('ImageSearch', {'query': 'object'}, self.pages, 'planner')
        self.assertNotIn('path', json.loads(result.text)['results'][0])
        self.assertFalse(result.images)
        self.assertEqual(media.sources(self.pages), {})

    def test_source_errors_and_empty_results_survive_to_context_and_disk(self):
        for errors in ([], [{'source': 'gemini', 'code': '403', 'message': 'Forbidden'}]):
            with self.subTest(errors=errors), patch.object(image_search, 'search', return_value=([], errors)):
                result = tools.media_call('ImageSearch', {'query': 'nothing'}, self.pages, 'planner')
            body = json.loads(result.text)
            self.assertEqual(body, {'results': [], 'errors': errors})
            reports = [json.loads(p.read_text()) for p in self.pages.glob('assets/img/*/search.json')]
            self.assertIn(body, [r['result'] for r in reports])

    def test_search_report_is_compact_but_provenance_keeps_provider_fields(self):
        def search(query, count, out):
            rows, errors = self.fake_search(query, count, out)
            rows[0].update(query_index=0, download_attempts=[{'url': 'https://example.org/image'}])
            return rows, errors
        with patch.object(image_search, 'search', search):
            result = tools.media_call('ImageSearch', {'query': ['x']}, self.pages, 'planner')
        self.assertNotIn('download_attempts', result.text)
        self.assertEqual(json.loads(result.text)['results'][0]['query_index'], 0)
        self.assertIn('download_attempts', next(iter(media.sources(self.pages).values())))

    def test_decode_limit_is_an_error(self):
        with patch.object(media.Image, 'open', side_effect=Image.DecompressionBombWarning('oversized')):
            with self.assertRaises(ValueError):
                media.image_info(self.pages / 'a.png')

    def test_planner_can_research_after_structured_error_without_new_requirement(self):
        seen = []
        turns = iter([response(call('ImageSearch', query='first')),
                      response(call('ImageSearch', query='second')),
                      response(call('FinalizePlan', pages_md=PAGES))])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', side_effect=[
                search_output([], [{'source': 'gemini', 'code': '403', 'message': 'Forbidden'}]),
                search_output([])]):
            self.assertEqual(planner.deck_call(self.run, 'prompt')[2], {})
        self.assertIn('Forbidden', json.dumps(seen[1]))
        self.assertEqual(len(seen), 3)

    def test_download_pins_public_ip_and_preserves_tls_host(self):
        sock = Mock()
        tls = Mock()
        with patch.object(media.socket, 'getaddrinfo', return_value=[
                (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]), \
                patch.object(media.socket, 'create_connection', return_value=sock) as connect, \
                patch.object(media.ssl, 'create_default_context', return_value=tls):
            conn, parsed = media._public_connection('https://image.example/a', 12)
        self.assertEqual(connect.call_args.args[0], ('93.184.216.34', 443))
        tls.wrap_socket.assert_called_once_with(sock, server_hostname='image.example')
        self.assertEqual(conn.host, 'image.example')
        conn.close()

    def test_download_rejects_private_targets_before_connecting(self):
        for address in ('127.0.0.1', '10.0.0.1', '169.254.169.254', '::1'):
            with self.subTest(address=address), patch.object(media.socket, 'getaddrinfo', return_value=[
                    (socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))]), \
                    patch.object(media.socket, 'create_connection') as connect, self.assertRaises(ValueError):
                media._public_connection('https://image.example/a', 12)
            connect.assert_not_called()
        for url in ('file:///etc/passwd', 'https://key:secret@example.org/a'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                media._public_connection(url, 12)

    def test_download_checks_redirect_and_never_sends_api_key(self):
        conn = Mock()
        response = Mock(status=302)
        response.getheader.return_value = 'http://127.0.0.1/private'
        conn.getresponse.return_value = response
        from urllib.parse import urlsplit
        with patch.object(media, '_public_connection', side_effect=[
                (conn, urlsplit('https://image.example/a')), ValueError('private address')]) as connect, \
                self.assertRaises(ValueError):
            media._download_image('https://image.example/a', self.pages, 0, media.time.monotonic() + 30)
        self.assertEqual(connect.call_args.args[0], 'http://127.0.0.1/private')
        self.assertEqual(set(conn.request.call_args.kwargs['headers']), {'User-Agent'})
        conn.close.assert_called_once()

    def test_download_uses_image_bytes_not_url_extension_and_rejects_html(self):
        buf = io.BytesIO()
        Image.new('RGB', (20, 30)).save(buf, 'PNG')
        from urllib.parse import urlsplit
        for content, valid in ((buf.getvalue(), True), (b'<html>access denied</html>', False)):
            conn = Mock()
            conn.getresponse.return_value = Mock(status=200, read=Mock(side_effect=[content, b'']))
            with patch.object(media, '_public_connection', return_value=(conn, urlsplit('https://image.example/a.jpg'))):
                if valid:
                    path, w, h = media._download_image('https://image.example/a.jpg', self.pages, 0, media.time.monotonic() + 30)
                    self.assertEqual((path.suffix, w, h), ('.png', 20, 30))
                else:
                    with self.assertRaises(OSError):
                        media._download_image('https://image.example/a.jpg', self.pages, 1, media.time.monotonic() + 30)
            self.assertFalse(list(self.pages.glob('*.part')))

    def test_unsafe_owner_and_provider_filename_are_rejected(self):
        with self.assertRaises(ValueError):
            media.fetch('ImageSearch', {'query': 'object'}, self.pages, '../other')
        with patch.object(image_search, 'search', return_value=([{'file': '../../outside.jpg'}], [])):
            _, rows, _ = media.fetch('ImageSearch', {'query': 'object'}, self.pages, 'planner')
        self.assertNotIn('path', rows[0])
        self.assertIn('error', rows[0])

    def test_no_image_plan_finishes_in_one_call_and_does_not_write_drafts(self):
        with patch.object(planner.llm, 'respond', return_value=response(
                call('FinalizePlan', pages_md=PAGES))) as respond:
            self.assertEqual(planner.deck_call(self.run, 'prompt'), ('', PAGES, {}))
        self.assertEqual(respond.call_count, 1)
        self.assertFalse((self.root / planner.PAGES_REL).exists())

    def test_search_review_research_replace_and_page_specific_delivery(self):
        a, b = 'assets/img/planner-a/a.jpg', 'assets/img/planner-b/b.jpg'
        self.image(a)
        self.image(b)
        seen = []
        turns = iter([response(call('ImageSearch', query='a')),
                      response(call('ImageSearch', query='b')),
                      response(call('FinalizePlan', pages_md=PAGES, media_by_page={'page-02': [b]}))])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', side_effect=[
                search_output([{'path': a}], images=[('image/png', 'AA==')]),
                search_output([{'path': b}], images=[('image/png', 'AA==')])]):
            _, doc, mapping = planner.deck_call(self.run, 'prompt')
        self.assertEqual(doc, PAGES)
        self.assertIn('input_image', json.dumps(seen[1]))
        self.assertIn(b, json.dumps(seen[2]))
        briefs = planner.briefs(self.run, ['01', '02'], mapping)
        self.assertNotIn(a, str(briefs))
        self.assertNotIn(b, briefs[0].prompt)
        self.assertIn(b, briefs[1].prompt)
        self.assertEqual(set(briefs[1].as_tool_input()), {'description', 'prompt'})

    def test_planner_first_search_batches_needs_then_can_supplement(self):
        queries = ['Breiman portrait', 'Rosenblatt portrait', 'chloroplast TEM']
        paths = [f'assets/img/planner-batch/{i}.jpg' for i in range(3)]
        for path in paths:
            self.image(path)
        seen = []
        turns = iter([response(call('ImageSearch', query=queries)),
                      response(call('ImageSearch', query='chloroplast TEM public source')),
                      response(call('FinalizePlan', pages_md=PAGES, media_by_page={'page-02': paths}))])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', side_effect=[
                search_output([{'query_index': i, 'path': path} for i, path in enumerate(paths)],
                              images=[('image/png', 'AA==')] * 3),
                search_output([])]) as fetch:
            mapping = planner.deck_call(self.run, 'prompt')[2]
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args_list[0].args[:2], ('ImageSearch', {'query': queries}))
        self.assertEqual(fetch.call_args_list[1].args[:2],
                         ('ImageSearch', {'query': 'chloroplast TEM public source'}))
        self.assertEqual(mapping, {'page-02': paths})
        content = seen[1][-1]['content']
        self.assertEqual([p['type'] for p in content], ['input_text', 'input_image'] * 3)
        self.assertEqual([json.loads(p['text']) for p in content[::2]],
                         [{'需求': q, 'path': path} for q, path in zip(queries, paths)])
        first_result = next(item for item in seen[1] if item.get('type') == 'function_call_output')
        self.assertEqual([r['query_index'] for r in json.loads(first_result['output'])['results']], [0, 1, 2])

    def test_planner_image_labels_skip_failed_rows_and_survive_multiple_calls(self):
        seen = []
        turns = iter([response(call('ImageSearch', query=['portrait', 'apparatus']),
                               call('ImageSearch', query='leaf micrograph')),
                      response(call('FinalizePlan', pages_md=PAGES))])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', side_effect=[
                search_output([{'query_index': 0, 'error': '403'},
                               {'query_index': 1, 'path': 'apparatus.png'},
                               {'query_index': 1, 'path': 'apparatus-detail.png'}],
                              images=[('image/png', 'AA=='), ('image/png', 'AQ==')]),
                search_output([{'path': 'leaf.png'}], images=[('image/png', 'Ag==')])]):
            planner.deck_call(self.run, 'prompt')
        content = seen[1][-1]['content']
        self.assertEqual([json.loads(p['text']) for p in content[::2]], [
            {'需求': 'apparatus', 'path': 'apparatus.png'},
            {'需求': 'apparatus', 'path': 'apparatus-detail.png'},
            {'需求': 'leaf micrograph', 'path': 'leaf.png'}])
        self.assertEqual([p['image_url'] for p in content[1::2]],
                         ['data:image/png;base64,' + b for b in ['AA==', 'AQ==', 'Ag==']])

    def test_planner_generated_image_label_uses_prompt(self):
        seen = []
        turns = iter([response(call('ImageGen', prompt='sunlit leaf illustration')),
                      response(call('FinalizePlan', pages_md=PAGES))])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', return_value=
                tools.Out(json.dumps([{'path': 'leaf.png'}]), [('image/png', 'AA==')])):
            planner.deck_call(self.run, 'prompt')
        self.assertEqual(json.loads(seen[1][-1]['content'][0]['text']),
                         {'需求': 'sunlit leaf illustration', 'path': 'leaf.png'})

    def test_same_response_cannot_adopt_new_image_but_next_response_can(self):
        path = 'assets/img/planner-a/a.jpg'
        self.image(path)
        final = call('FinalizePlan', pages_md=PAGES, media_by_page={'page-02': [path]})
        seen = []
        turns = iter([response(call('ImageSearch', query='a'), final), response(final)])
        def respond(_i, hist, *_a, **_kw):
            seen.append(copy.deepcopy(hist))
            return next(turns)
        with patch.object(planner.llm, 'respond', respond), patch.object(tools, 'media_call', return_value=
                search_output([{'path': path}], images=[('image/png', 'AA==')])):
            _, _, mapping = planner.deck_call(self.run, 'prompt')
        self.assertEqual(mapping, {'page-02': [path]})
        self.assertIn('尚未在此前工具结果中返回', json.dumps(seen[1], ensure_ascii=False))

    def test_mapping_checks_page_path_existence_and_run_boundary(self):
        path = 'assets/img/planner-a/a.jpg'
        target = self.image(path)
        available = {path: {}}
        for mapping in ({'page-99': [path]}, {'page-02': ['unknown']}, {'page-02': path}):
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                planner.validate_media(mapping, PAGES, available, self.pages)
        with self.assertRaises(ValueError):
            planner.validate_media({'page-02': ['../outside.jpg']}, PAGES, {'../outside.jpg': {}}, self.pages)
        target.unlink()
        with self.assertRaises(ValueError):
            planner.validate_media({'page-02': [path]}, PAGES, available, self.pages)

    def test_mapping_normalizes_simple_keys_without_mutating_arguments(self):
        path = 'assets/img/planner-a/a.jpg'
        self.image(path)
        for key in ('page-02', 'page_02', '2', '02'):
            mapping = {key: [path]}
            original = copy.deepcopy(mapping)
            with self.subTest(key=key):
                self.assertEqual(planner.validate_media(mapping, PAGES, {path: {}}, self.pages),
                                 {'page-02': [path]})
                self.assertEqual(mapping, original)
        self.assertEqual(planner.validate_media({}, PAGES, {}, self.pages), {})

    def test_mapping_rejects_unknown_ambiguous_and_colliding_keys(self):
        for mapping in ({'chapter2': []}, {'99': []}, {'page_99': []}, {'page-002': []},
                        {'page-02': [], '02': []}):
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                planner.validate_media(mapping, PAGES, {}, self.pages)

    def test_simple_key_finalizes_without_an_extra_model_response(self):
        path = 'assets/img/planner-a/a.jpg'
        self.image(path)
        final = call('FinalizePlan', pages_md=PAGES, media_by_page={'page_02': [path]})
        raw = final.arguments
        with patch.object(planner.llm, 'respond', side_effect=[
                response(call('ImageSearch', query='a')), response(final)]) as respond, \
                patch.object(tools, 'media_call', return_value=search_output([{'path': path}])):
            self.assertEqual(planner.deck_call(self.run, 'prompt')[2], {'page-02': [path]})
        self.assertEqual(respond.call_count, 2)
        self.assertEqual(final.arguments, raw)

    def test_failed_search_can_finish_without_images(self):
        with patch.object(planner.llm, 'respond', side_effect=[
                response(call('ImageSearch', query='a')), response(call('FinalizePlan', pages_md=PAGES))]), \
                patch.object(tools, 'media_call', side_effect=RuntimeError('upstream failed')):
            self.assertEqual(planner.deck_call(self.run, 'prompt')[2], {})

    def test_natural_stop_without_final_submission_fails(self):
        with patch.object(planner.llm, 'respond', return_value=response()), self.assertRaisesRegex(
                RuntimeError, '未提交'):
            planner.deck_call(self.run, 'prompt')

    def test_code_media_does_not_grant_theme_or_shared_write_access(self):
        self.assertIsNone(code_runtime.tool_guard('ImageSearch', {'query': 'x'}, self.pages, 'page-02'))
        image = 'assets/img/planner-a/a.jpg'
        self.assertIsNone(code_runtime.tool_guard('Read', {'file_path': image}, self.pages, 'page-02'))
        for name, path in [('Read', 'assets/theme.css'), ('Write', image), ('Edit', image)]:
            self.assertIsNotNone(code_runtime.tool_guard(name, {'file_path': path}, self.pages, 'page-02'))

    def test_nonvisual_profiles_do_not_advertise_image_tools(self):
        names = {row['name'] for row in tools.specs('build-code', vision_input=False)}
        self.assertTrue(media.NAMES.isdisjoint(names))

    def test_shared_media_is_read_only_for_visual_page_edits(self):
        path = 'assets/img/planner-a/photo.jpg'
        target = self.image(path)
        before = target.read_bytes()
        result = tools.run('Write', {'file_path': path, 'content': 'overwrite'},
                           self.pages, None, 'page-02')
        self.assertIn('拒绝', result)
        self.assertEqual(target.read_bytes(), before)

    def test_bad_provenance_does_not_block_unrelated_briefs(self):
        log = self.pages / 'assets/img/planner-a/attribution.json'
        log.parent.mkdir(parents=True)
        log.write_text('{interrupted')
        self.assertEqual(len(planner.briefs(self.run, ['01', '02'])), 2)

    def test_interrupted_page_write_never_publishes_briefs(self):
        with patch.object(planner, 'ROOT', self.root):
            run = planner.Run('test', 10, 'test', 'write-failure')
        def seed(current, *_):
            (current.assets / 'CHASSIS.md').write_text('Deck.fmt(v, d)')
        write = Path.write_text
        def fail(path, *args, **kwargs):
            if path.name == 'p01.md':
                raise OSError('simulated write interruption')
            return write(path, *args, **kwargs)
        css = '/* ==== INTERFACE ==== x ==== /INTERFACE ==== */'
        with patch.object(planner, 'seed', seed), \
                patch.object(planner, 'deck_call', return_value=(css, PAGES, {})), \
                patch.object(Path, 'write_text', fail), self.assertRaises(OSError):
            planner.plan_run(run, self.root, self.root)
        self.assertFalse((run.root / 'briefs.json').exists())


if __name__ == '__main__':
    unittest.main()
