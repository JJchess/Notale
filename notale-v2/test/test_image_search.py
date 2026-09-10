"""Grounded search transport and automatic extraction, without paid requests."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlsplit

import httpx
from PIL import Image

from core import llm
from tools import image_search as search, media, runtime as tools


class ImageSearchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pages = Path(self.tmp.name)
        for context in (patch.dict(os.environ, {'GEMINI_API_KEY': 'test-secret'}),
                        patch.object(llm, 'config', return_value={}),
                        patch.object(media, 'search_backend', return_value='gemini')):
            context.start()
            self.addCleanup(context.stop)

    def response(self, groups):
        return httpx.Response(200, request=httpx.Request('POST', search.ENDPOINT), json={
            'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps({'queries': groups})}]},
                            'groundingMetadata': {'webSearchQueries': ['actual query']}}],
            'usageMetadata': {'promptTokenCount': 20, 'candidatesTokenCount': 30, 'thoughtsTokenCount': 10}})

    def item(self, title='person', page='https://source.example/person', image='https://image.example/a.jpg'):
        return {'title': title, 'page_url': page, 'image_url': image}

    def download(self, url, out, index, deadline):
        path = out / f'{index:02d}.jpg'
        Image.new('RGB', (30, 40)).save(path)
        return path, 30, 40

    def invoke(self, query='person', count=3):
        return tools.media_call('ImageSearch', {'query': query, 'count': count}, self.pages, 'test')

    def test_single_request_downloads_and_keeps_usage_off_context(self):
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': 0, 'results': [self.item()]}])) as post, \
                patch.object(media, '_download_image', self.download), patch.object(llm, 'respond') as model:
            result = self.invoke()
        post.assert_called_once()
        model.assert_not_called()
        row = json.loads(result.text)['results'][0]
        self.assertNotIn('query_index', row)
        self.assertTrue((self.pages / row['path']).is_file())
        self.assertEqual(len(result.images), 1)
        self.assertNotIn('usageMetadata', result.text)
        journal = json.loads(next(self.pages.glob('assets/img/*/provider.json')).read_text())
        self.assertEqual(journal['response']['usageMetadata']['thoughtsTokenCount'], 10)
        self.assertNotIn('test-secret', json.dumps(journal))
        self.assertEqual(post.call_args.kwargs['json']['generationConfig']['thinkingConfig']['thinkingLevel'], 'low')
        self.assertTrue(post.call_args.kwargs['json']['toolConfig']['includeServerSideToolInvocations'])

    def test_server_search_invocations_work_without_grounding_metadata(self):
        payload = json.loads(self.response([{'query_index': 0, 'results': []}]).content)
        candidate = payload['candidates'][0]
        candidate.pop('groundingMetadata')
        candidate['content']['parts'].insert(0, {'toolCall': {'toolType': 'GOOGLE_SEARCH_WEB', 'args': {'queries': ['person']}}})
        with patch.object(search.httpx, 'post', return_value=httpx.Response(
                200, json=payload, request=httpx.Request('POST', search.ENDPOINT))):
            self.assertEqual(json.loads(self.invoke().text), {'results': [], 'errors': []})

    def test_missing_search_evidence_is_not_claimed_as_actual_search(self):
        payload = json.loads(self.response([{'query_index': 0, 'results': [self.item()]}]).content)
        payload['candidates'][0].pop('groundingMetadata')
        with patch.object(search.httpx, 'post', return_value=httpx.Response(
                200, json=payload, request=httpx.Request('POST', search.ENDPOINT))), \
                patch.object(media, '_download_image') as download:
            result = self.invoke()
        self.assertIn('搜索执行记录', result.text)
        download.assert_not_called()

    def test_batch_is_one_request_preserves_input_order_and_duplicate_query_identity(self):
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': 1, 'results': [self.item('second')]},
                {'query_index': 0, 'results': [self.item('first')]}])) as post, \
                patch.object(media, '_download_image', self.download):
            result = self.invoke(['same need', 'same need'])
        post.assert_called_once()
        rows = json.loads(result.text)['results']
        self.assertEqual([r['query_index'] for r in rows], [0, 1])
        self.assertEqual([r['title'] for r in rows], ['first', 'second'])
        self.assertEqual(len({r['path'] for r in rows}), 2)

    def test_request_preserves_visual_needs_without_expanding_schema_or_tools(self):
        needs = ['Leo Breiman 本人照片，用于介绍 Bagging 提出者',
                 '钟罩实验装置示意，用于解释植物和动物的实验关系']
        body = search.request_body(needs, 3)
        prompt = body['contents'][0]['parts'][0]['text']
        for need in needs:
            self.assertIn(need, prompt)
        self.assertIn('subject, image type, and teaching purpose', prompt)
        self.assertIn('not a generic article cover', prompt)
        self.assertIn('PNG/JPEG/WebP/GIF', prompt)
        self.assertIn('Wikimedia Commons File: detail pages may omit', prompt)
        self.assertIn('alone is not a downloadable image candidate', prompt)
        self.assertIn('empty results if neither form is found', prompt)
        candidate_schema = body['generationConfig']['responseJsonSchema']['properties'][
            'queries']['items']['properties']['results']['items']
        self.assertEqual(candidate_schema['required'], ['title', 'page_url'])
        self.assertEqual(body['tools'], [{'google_search': {}}])
        self.assertEqual(set(body['generationConfig']['responseJsonSchema']['properties']), {'queries'})

    def test_batch_omitted_group_is_error_but_explicit_empty_is_not(self):
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': 0, 'results': []}])):
            result = self.invoke(['empty', 'missing'])
        body = json.loads(result.text)
        self.assertEqual(body['results'], [])
        self.assertEqual(len(body['errors']), 1)
        self.assertEqual(body['errors'][0]['query_index'], 1)

    def test_partial_download_failure_does_not_remove_success(self):
        def download(url, *args):
            if 'blocked' in url:
                raise OSError('HTTP 403')
            return self.download(url, *args)
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': 0, 'results': [self.item()]},
                {'query_index': 1, 'results': [self.item(image='https://image.example/blocked')]}])), \
                patch.object(media, '_download_image', download), \
                patch.object(search, 'page_images', side_effect=OSError('source HTTP 403')):
            result = self.invoke(['person', 'blocked'])
        rows = json.loads(result.text)['results']
        self.assertIn('path', rows[0])
        self.assertNotIn('path', rows[1])
        self.assertIn('403', rows[1]['error'])
        self.assertEqual(len(result.images), 1)

    def test_count_and_exact_dedup_are_per_need(self):
        items = [self.item(), self.item(), self.item(page='https://source.example/other'), self.item(title='extra')]
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': i, 'results': items} for i in range(2)])), \
                patch.object(media, '_download_image', self.download):
            result = self.invoke(['a', 'b'], 2)
        self.assertEqual([r['query_index'] for r in json.loads(result.text)['results']], [0, 0, 1, 1])

    def test_missing_key_and_invalid_queries_make_no_request(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}), patch.object(search.httpx, 'post') as post:
            self.assertIn('GEMINI_API_KEY', self.invoke().text)
            post.assert_not_called()
        for query in ('', [], [''], [None], None, 7):
            with self.subTest(query=query), patch.object(search.httpx, 'post') as post:
                self.assertTrue(json.loads(self.invoke(query).text)['errors'])
                post.assert_not_called()

    def test_http_and_invalid_success_errors_are_not_zero_matches(self):
        cases = [(code, {}) for code in (400, 401, 403, 429, 500)] + [(200, {}), (200, [])]
        for status, payload in cases:
            response = httpx.Response(status, json=payload, headers={'Retry-After': '2'},
                                      request=httpx.Request('POST', search.ENDPOINT))
            with self.subTest(status=status, payload=payload), patch.object(search.httpx, 'post', return_value=response):
                body = json.loads(self.invoke().text)
                self.assertTrue(body['errors'])
                self.assertEqual(body['results'], [])
                if status == 429:
                    self.assertEqual(body['errors'][0]['retry_after_seconds'], 2)

    def test_timeout_is_reported_without_retry(self):
        with patch.object(search.httpx, 'post', side_effect=httpx.ReadTimeout('timeout')) as post:
            self.assertTrue(json.loads(self.invoke().text)['errors'])
            post.assert_called_once()

    def test_malformed_candidate_shapes_stay_structured_errors(self):
        cases = [{'candidates': [None]}, {'candidates': {}},
                 {'candidates': [{'finishReason': 'STOP', 'content': None}]},
                 {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [None]}}]},
                 {'candidates': [{'finishReason': 'STOP', 'groundingMetadata': {'webSearchQueries': ['x']},
                                  'content': {'parts': [{'text': 7, 'toolCall': None}]}}]}]
        for payload in cases:
            with self.subTest(payload=payload), patch.object(search.httpx, 'post', return_value=httpx.Response(
                    200, json=payload, request=httpx.Request('POST', search.ENDPOINT))):
                body = json.loads(self.invoke().text)
                self.assertTrue(body['errors'])
                self.assertEqual(body['results'], [])

    def test_invalid_json_and_truncated_response_are_errors(self):
        for finish, content in [('STOP', 'not json'), ('MAX_TOKENS', '{"queries": []}')]:
            payload = {'candidates': [{'finishReason': finish, 'content': {'parts': [{'text': content}]}}]}
            with patch.object(search.httpx, 'post', return_value=httpx.Response(
                    200, json=payload, request=httpx.Request('POST', search.ENDPOINT))):
                self.assertTrue(json.loads(self.invoke().text)['errors'])

    def test_legacy_config_is_not_silently_used(self):
        with patch.object(media, 'search_backend', return_value='nokey'), \
                patch.object(media.subprocess, 'run') as vendor, patch.object(search.httpx, 'post') as post:
            self.assertIn('未知图片检索后端', self.invoke().text)
        vendor.assert_not_called()
        post.assert_not_called()

    def test_commons_uses_main_image_instead_of_model_url(self):
        page = 'https://commons.wikimedia.org/wiki/File:Photo.jpg'
        with patch.object(search.httpx, 'post', return_value=self.response([
                {'query_index': 0, 'results': [self.item(page=page, image='https://image.example/wrong')]}])) as post, \
                patch.object(media, '_download_image', side_effect=self.download) as download, \
                patch.object(search, 'page_images', return_value=(page, ['https://image.example/main.jpg'])):
            result = self.invoke()
        post.assert_called_once()
        self.assertIn('path', json.loads(result.text)['results'][0])
        attribution = next(iter(media.sources(self.pages).values()))
        self.assertEqual(attribution['extracted_from'], 'source_html')
        self.assertEqual(len(attribution['download_attempts']), 1)
        self.assertEqual(download.call_args.args[0], 'https://image.example/main.jpg')

    def parse_page(self, html):
        conn = Mock()
        response = Mock(status=200)
        response.getheader.return_value = 'text/html; charset=utf-8'
        response.read.return_value = html
        conn.getresponse.return_value = response
        page = 'https://commons.wikimedia.org/wiki/File:Photo.jpg'
        with patch.object(media, '_public_connection', return_value=(conn, urlsplit(page))):
            final, urls = search.page_images(page, search.time.monotonic() + 30)
        self.assertEqual(set(conn.request.call_args.kwargs['headers']), {'User-Agent'})
        return urls

    def test_real_commons_pages_ignore_preceding_icon_and_use_svg_raster_preview(self):
        fixtures = Path(__file__).parent / 'fixtures/image-search'
        for name, expected in [('Lettuce_Thylakoid', '/7/71/Lettuce_Thylakoid.jpg'),
                               ('Leaf_Tissue_Structure', 'Leaf_Tissue_Structure.svg.png')]:
            with self.subTest(name=name):
                urls = self.parse_page((fixtures / (name + '.html')).read_bytes())
                self.assertEqual(len(urls), 1)
                self.assertIn(expected, urls[0])
                self.assertNotIn('CC_some_rights_reserved', urls[0])

    def test_parser_ignores_images_outside_main_region(self):
        html = (b'<meta property="og:image" content="/cover.png"><img src="/logo.png">'
                b'<div id="file" class="fullImageLink"><div><a><img src="/main.png"></a></div></div>'
                b'<img src="/history.png">')
        self.assertEqual(self.parse_page(html), ['https://commons.wikimedia.org/main.png'])
        self.assertEqual(self.parse_page(b'<img src="/logo.png">'), [])

    def test_missing_or_failed_commons_main_does_not_fall_back_to_direct_url(self):
        for urls in ([], ['https://image.example/blocked.jpg']):
            with self.subTest(urls=urls), patch.object(search.httpx, 'post', return_value=self.response([
                    {'query_index': 0, 'results': [self.item(page='https://commons.wikimedia.org/wiki/File:Photo.jpg')]}])), \
                    patch.object(search, 'page_images', return_value=('https://commons.wikimedia.org/wiki/File:Photo.jpg', urls)), \
                    patch.object(media, '_download_image', side_effect=OSError('403')) as download:
                row = json.loads(self.invoke().text)['results'][0]
                self.assertNotIn('path', row)
                self.assertIn('主图', row['error'])
                self.assertEqual(download.call_count, len(urls))

    def test_ordinary_page_never_substitutes_another_image(self):
        for url in ('', 'https://image.example/blocked.jpg'):
            with self.subTest(url=url), patch.object(search.httpx, 'post', return_value=self.response([
                    {'query_index': 0, 'results': [self.item(image=url)]}])), \
                    patch.object(media, '_download_image', side_effect=OSError('403')), \
                    patch.object(search, 'page_images') as html:
                row = json.loads(self.invoke().text)['results'][0]
                self.assertNotIn('path', row)
                self.assertIn('error', row)
                html.assert_not_called()

    def test_commons_recognition_is_exact(self):
        self.assertTrue(search._commons_file('https://commons.wikimedia.org/wiki/File%3ALeaf.svg'))
        for url in ('https://commons.wikimedia.org.evil.example/wiki/File:Leaf.svg',
                    'https://en.wikipedia.org/wiki/Leaf', 'https://commons.wikimedia.org/wiki/Category:Leaves'):
            self.assertFalse(search._commons_file(url))

    def test_page_redirect_rechecks_private_address(self):
        conn = Mock()
        conn.getresponse.return_value = Mock(status=302)
        conn.getresponse.return_value.getheader.return_value = 'http://127.0.0.1/private'
        with patch.object(media, '_public_connection', side_effect=[
                (conn, urlsplit('https://source.example/page')), ValueError('private address')]) as connect:
            with self.assertRaises(ValueError):
                search.page_images('https://source.example/page', search.time.monotonic() + 30)
        self.assertEqual(connect.call_args.args[0], 'http://127.0.0.1/private')


if __name__ == '__main__':
    unittest.main()
