import io
import base64
import json
import os
import threading
import unittest
from unittest.mock import patch
import urllib.error

from cloud_inference import CloudInference, NoRedirect
from learning_engine import LearningEngine, Cancelled, prediction_budget, solution_quality_issues


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

    def test_llama_schema_mode_constrains_fast_answer_shape(self):
        from learning_engine import FAST_SCHEMA
        self.cloud.json_mode='llama-schema'
        self.payload['format']=FAST_SCHEMA
        with patch.object(self.cloud.opener,'open',return_value=self.events('{"parts":[]}')) as call:
            self.cloud.stream(self.job,self.payload,Cancelled)
        body=json.loads(call.call_args.args[0].data)
        self.assertEqual(body['response_format'],{'type':'json_object','schema':FAST_SCHEMA})
        self.assertIn('parts',FAST_SCHEMA['required'])

    def test_vision_image_becomes_data_url_only_on_server(self):
        encoded=base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'fake-test-image').decode()
        payload={**self.payload,'messages':[{'role':'user','content':'Transcribe only','images':[encoded]}]}
        with patch.object(self.cloud.opener,'open',return_value=self.events('y^2=4x')) as call:
            self.assertEqual(self.cloud.stream(self.job,payload,Cancelled),'y^2=4x')
        body=json.loads(call.call_args.args[0].data)
        self.assertEqual(body['messages'][0]['content'][1]['type'],'image_url')
        self.assertEqual(body['messages'][0]['content'][1]['image_url']['url'],f'data:image/png;base64,{encoded}')
        self.assertNotIn('test-secret-not-real',call.call_args.args[0].data.decode())

    def test_vision_rejects_non_image_before_network(self):
        payload={**self.payload,'messages':[{'role':'user','content':'Transcribe','images':[base64.b64encode(b'<svg/>').decode()]}]}
        with patch.object(self.cloud.opener,'open') as call:
            with self.assertRaisesRegex(ValueError,'PNG、JPEG 或 WebP'):
                self.cloud.stream(self.job,payload,Cancelled)
            call.assert_not_called()

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

    def test_free_quota_exhaustion_has_actionable_message(self):
        error=urllib.error.HTTPError('https://model.example.test',403,'private upstream details',{},None)
        with patch.object(self.cloud.opener,'open',side_effect=error):
            with self.assertRaisesRegex(ValueError,'免费额度用尽') as caught:
                self.cloud.stream(self.job,self.payload,Cancelled)
        self.assertNotIn('private upstream details',str(caught.exception))

    def test_health_probes_once_and_contains_no_key(self):
        with patch.object(self.cloud.opener,'open',return_value=io.BytesIO(b'{"data":[{"id":"test-model"}]}')) as call:
            self.assertTrue(self.cloud.health()['available'])
            self.assertTrue(self.cloud.health()['available'])
            self.assertEqual(call.call_count,1)
        self.assertNotIn('test-secret',json.dumps(self.cloud.health()))

    def test_multiple_allowlisted_models_are_discovered_and_routed(self):
        with patch.dict(os.environ, {'DONGJIEXI_ALLOWED_MODELS': 'test-model,deepseek-r1-8b'}):
            cloud = CloudInference()
        with patch.object(cloud.opener, 'open', return_value=io.BytesIO(b'{"data":[{"id":"deepseek-r1-8b"},{"id":"not-allowed"}]}')):
            self.assertEqual(cloud.health()['models'], ['deepseek-r1-8b'])
        with patch.object(cloud.opener, 'open', return_value=self.events()) as call:
            cloud.stream(self.job, {**self.payload, 'model': 'deepseek-r1-8b'}, Cancelled)
        self.assertEqual(json.loads(call.call_args.args[0].data)['model'], 'deepseek-r1-8b')

    def test_text_only_model_does_not_advertise_image_recognition(self):
        with patch.dict(os.environ, {'DONGJIEXI_MODEL_VISION': '0'}):
            cloud = CloudInference()
        with patch.object(cloud.opener, 'open', return_value=io.BytesIO(b'{"data":[{"id":"test-model"}]}')):
            self.assertTrue(cloud.health()['available'])
            self.assertFalse(cloud.health()['vision'])

    def test_insecure_endpoint_rejected(self):
        self.cloud.base='http://model.example.test'
        self.assertFalse(self.cloud.configured())
        with self.assertRaises(ValueError):self.cloud.request('/models')

    def test_explicit_loopback_http_only_for_on_device_model(self):
        self.cloud.base='http://127.0.0.1:8080/v1'
        self.assertFalse(self.cloud.configured())
        with patch.dict(os.environ, {'DONGJIEXI_ALLOW_LOOPBACK_MODEL_HTTP': '1'}):
            self.assertTrue(self.cloud.configured())
            self.cloud.base='http://192.168.1.2:8080/v1'
            self.assertFalse(self.cloud.configured())

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

    def test_fast_cloud_solve_answers_before_a_bounded_scene_request(self):
        engine=LearningEngine('.',lambda text: [{'index':1,'label':'第一问','body':text,'question':text}])
        self.addCleanup(engine.close)
        raw={'title':'Test','parts':[{'index':1,'status':'answered','answer':'$x=1$','steps':['由题意列式。','$x=1$']}], 'scene':None}
        job={'cancel':threading.Event(),'status':'running'};engine.jobs['fast']=job
        engine.busy.acquire(False)
        scene={'type':'circle','h':0,'k':0,'orientation':'horizontal','dynamicLine':False,'points':{},'lines':[],
               'curvePoints':[],'a':1,'b':1,'r':1,'p':1,'theta':42,'direction':1,'lineThrough':'center'}
        with patch.object(engine.cloud,'stream',side_effect=[json.dumps(raw),json.dumps(scene)]) as stream:
            engine._run('fast',{'kind':'solve','model':'test-model','text':'求 x。','depth':'normal'})
        self.assertEqual(job['status'],'completed')
        self.assertEqual(stream.call_count,2)
        answer_payload=stream.call_args_list[0].args[1]
        scene_payload=stream.call_args_list[1].args[1]
        self.assertLess(answer_payload['options']['num_predict'],10000)
        self.assertEqual(answer_payload['format']['required'],['parts'])
        self.assertIn('已完成的解答',scene_payload['messages'][1]['content'])
        self.assertEqual(job['result']['scene']['type'],'circle')
        self.assertEqual(prediction_budget('solve','normal',12,True),6000)

    def test_unfinished_scratch_work_is_repaired_before_scene_generation(self):
        engine=LearningEngine('.',lambda text: [{'index':1,'label':'第一问','body':text,'question':text}])
        self.addCleanup(engine.close)
        bad={'parts':[{'index':1,'status':'answered','answer':'$x=1$','steps':['计算较复杂，结果为 $x=1$？']}], 'scene':None}
        good={'parts':[{'index':1,'status':'answered','answer':'$x=1$','steps':['由 $2x=2$，两边同除以 $2$ 得 $x=1$。']}], 'scene':None}
        job={'cancel':threading.Event(),'status':'running'};engine.jobs['repair']=job
        engine.busy.acquire(False)
        with patch.object(engine.cloud,'stream',side_effect=[json.dumps(bad),json.dumps(good),json.dumps(None)]) as stream:
            engine._run('repair',{'kind':'solve','model':'test-model','text':'解方程 $2x=2$。','depth':'normal'})
        self.assertEqual(job['status'],'completed')
        self.assertEqual(stream.call_count,3)
        self.assertEqual(solution_quality_issues(job['result']),[])
        self.assertIn('禁止问号占位',stream.call_args_list[1].args[1]['messages'][1]['content'])

    def test_cloud_submit_does_not_wait_for_model_list_probe(self):
        engine=LearningEngine('.',lambda text: [{'index':1,'label':'第一问','body':text,'question':text}])
        self.addCleanup(engine.close)
        with patch.object(engine,'health',side_effect=AssertionError('Text solve must not probe /models')):
            with patch.object(engine,'_run'):
                job=engine.submit({'kind':'solve','model':'test-model','text':'求 x。','depth':'normal'})
        self.assertEqual(job['status'],'running')
        engine.busy.release()


if __name__=='__main__':unittest.main()
