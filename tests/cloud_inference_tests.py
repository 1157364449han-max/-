import io
import json
import os
import threading
import unittest
from unittest.mock import patch
import urllib.error

from cloud_inference import CloudInference, NoRedirect
from learning_engine import LearningEngine, Cancelled


class CloudTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            'DONGJIEXI_INFERENCE_PROVIDER': 'chat-completions',
            'DONGJIEXI_MODEL_API_BASE': 'https://model.example.test/v1',
            'DONGJIEXI_MODEL_API_KEY': 'test-secret-not-real',
            'DONGJIEXI_MODEL_ID': 'test-model', 'DONGJIEXI_MAX_CONCURRENT': '2'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.cloud = CloudInference()
        self.job = {'cancel': threading.Event()}
        self.payload = {'model': 'test-model', 'messages': [{'role':'user','content':'Return JSON'}], 'format': {}}

    def events(self, content='answer', reason='stop'):
        return io.BytesIO(('data: '+json.dumps({'choices':[{'delta':{'content':content},'finish_reason':reason}]})+'\n\ndata: [DONE]\n').encode())

    def test_cloud_stream_and_server_only_key(self):
        self.payload['format']={'type':'object'}
        with patch.object(self.cloud.opener, 'open', return_value=self.events()) as call:
            self.assertEqual(self.cloud.stream(self.job,self.payload,Cancelled),'answer')
        req=call.call_args.args[0]
        self.assertEqual(req.full_url,'https://model.example.test/v1/chat/completions')
        body=json.loads(req.data)
        self.assertEqual(body['response_format'],{'type':'json_object'})
        self.assertNotIn('test-secret-not-real',req.data.decode())
        self.assertNotIn('keep_alive',body)

    def test_prompt_only_json_for_compatible_api_without_json_object_mode(self):
        self.cloud.json_mode='prompt-only'
        self.payload['format']={'type':'object'}
        with patch.object(self.cloud.opener,'open',return_value=self.events('{"parts":[]}')) as call:
            self.assertEqual(self.cloud.stream(self.job,self.payload,Cancelled),'{"parts":[]}')
        self.assertNotIn('response_format',json.loads(call.call_args.args[0].data))

    def test_incomplete_response_rejected(self):
        for reason in ['length',None,'content_filter']:
            with self.subTest(reason=reason), patch.object(self.cloud.opener,'open',return_value=self.events(reason=reason)):
                with self.assertRaises(ValueError): self.cloud.stream(self.job,self.payload,Cancelled)

    def test_cancel(self):
        self.job['cancel'].set()
        with patch.object(self.cloud.opener,'open',return_value=self.events()):
            with self.assertRaises(Cancelled): self.cloud.stream(self.job,self.payload,Cancelled)

    def test_wrong_model_no_network(self):
        with patch.object(self.cloud.opener,'open') as call:
            with self.assertRaises(ValueError): self.cloud.stream(self.job,{**self.payload,'model':'unapproved'},Cancelled)
            call.assert_not_called()

    def test_rate_limit_does_not_leak_error(self):
        error=urllib.error.HTTPError('https://model.example.test',429,'test-secret-not-real',{},None)
        with patch.object(self.cloud.opener,'open',side_effect=error):
            with self.assertRaisesRegex(ValueError,'额度或并发已满') as caught:self.cloud.stream(self.job,self.payload,Cancelled)
        self.assertNotIn('test-secret',str(caught.exception))

    def test_health_probes_once_and_contains_no_key(self):
        with patch.object(self.cloud.opener,'open',return_value=io.BytesIO(b'{"data":[{"id":"test-model"}]}')) as call:
            self.assertTrue(self.cloud.health()['available'])
            self.assertTrue(self.cloud.health()['available'])
            self.assertEqual(call.call_count,1)
        self.assertNotIn('test-secret',json.dumps(self.cloud.health()))

    def test_insecure_endpoint_rejected(self):
        self.cloud.base='http://model.example.test'
        self.assertFalse(self.cloud.configured())
        with self.assertRaises(ValueError):self.cloud.request('/models')

    def test_redirect_rejected(self):
        with self.assertRaises(ValueError):NoRedirect().redirect_request(None,None,302,'',{},'https://other.test')

    def test_bounded_parallel_capacity_and_local_preserved(self):
        engine=LearningEngine('.',lambda text:[])
        self.addCleanup(engine.close)
        self.assertTrue(engine.busy.acquire(False));self.assertTrue(engine.busy.acquire(False))
        self.assertFalse(engine.busy.acquire(False));engine.busy.release();engine.busy.release()
        with patch.dict(os.environ,{'DONGJIEXI_INFERENCE_PROVIDER':'ollama'}):
            local=LearningEngine('.',lambda text:[]);self.addCleanup(local.close)
            self.assertFalse(local.cloud.enabled)
            self.assertTrue(local.busy.acquire(False));self.assertFalse(local.busy.acquire(False));local.busy.release()

    def test_cloud_solution_uses_existing_verification_pipeline(self):
        from unittest.mock import Mock
        verify=Mock(side_effect=lambda result: {**result,'verification':{'status':'generated'}})
        engine=LearningEngine('.',lambda text: [{'index':0,'label':'本问','body':text,'question':text}],verify)
        self.addCleanup(engine.close)
        raw={'title':'Test','parts':[{'index':0,'status':'answered','answer':'$x=1$','steps':['$x=1$']}], 'scene':None}
        job={'cancel':threading.Event(),'status':'running'};engine.jobs['test']=job
        engine.busy.acquire(False)
        with patch.object(engine.cloud,'stream',return_value=json.dumps(raw)):
            engine._run('test',{'kind':'solve','model':'test-model','text':'求 x。'})
        self.assertEqual(job['status'],'completed')
        self.assertEqual(job['result']['mode'],'cloud-ai')
        verify.assert_called_once()


if __name__=='__main__':unittest.main()
