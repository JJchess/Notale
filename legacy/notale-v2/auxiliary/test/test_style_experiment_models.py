"""Offline checks for the explicit experimental model; no model calls or run writes."""
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from core import builder, llm, planner
from scripts.style_e2e import MODEL_PROFILE, model_args


class ExperimentModelsTest(unittest.TestCase):
    def test_all_builder_workflows_use_gemini_low(self):
        args = builder.parse_args(['--label', 'offline-model-test', *model_args('builder')])
        self.assertEqual(args.profile, 'gemini38-google-low')
        self.assertTrue(args.uniform)
        self.assertEqual(args.samples, 'mini')
        self.assertEqual(args.notes, 'notes')
        profile = llm.resolve_builder_profile(llm.config(), args.profile)
        with patch.object(llm, 'ModelRuntime', side_effect=lambda p: SimpleNamespace(profile=p)):
            runtimes = builder.workflow_runtimes(llm.config(), profile, args.uniform)
        self.assertEqual(len(runtimes), 4)
        self.assertEqual({r.profile.id for r in runtimes.values()}, {MODEL_PROFILE})
        self.assertEqual({r.profile.reasoning_effort for r in runtimes.values()}, {'low'})

    def test_planner_and_director_shared_runtime_uses_gemini_low(self):
        captured = {}

        def inspect_run(*args, **kwargs):
            # plan_run's Planner and Director both use llm.respond with this effort.
            runtime = llm.default_runtime()
            captured['profile'] = runtime.profile
            with patch.object(runtime, 'complete', return_value=SimpleNamespace()) as complete:
                llm.respond('offline', [], [], llm.config()['planner']['reasoning_effort'])
            captured['request'] = complete.call_args.args[0]

        argv = ['planner', '--label', 'offline-model-test', '--query', 'offline', *model_args('planner')]
        try:
            with patch.dict(llm._OVERRIDE, {}, clear=True), patch('sys.argv', argv), \
                    patch.object(planner, 'Run'), patch.object(planner, 'plan_run', side_effect=inspect_run):
                planner.main()
        finally:
            llm.config.cache_clear()
            llm.default_runtime.cache_clear()
        profile = captured['profile']
        self.assertEqual(profile.model, 'gemini-3.8-flash')
        self.assertEqual(profile.adapter, 'chat')
        self.assertEqual(profile.base_url, 'https://generativelanguage.googleapis.com/v1beta/openai')
        self.assertEqual(profile.api_key_env, 'GEMINI_API_KEY')
        self.assertEqual(captured['request']['reasoning']['effort'], 'low')

    def test_unknown_stage_is_rejected(self):
        with self.assertRaises(ValueError):
            model_args('typo')


if __name__ == '__main__':
    unittest.main()
