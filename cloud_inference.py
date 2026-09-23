"""Server-only Chat Completions adapter. No credentials or arbitrary URLs from clients."""
import json
import os
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('云端模型接口不允许重定向。')


class CloudInference:
    def __init__(self):
        self.enabled = os.environ.get('DONGJIEXI_INFERENCE_PROVIDER', 'ollama') == 'chat-completions'
        self.base = os.environ.get('DONGJIEXI_MODEL_API_BASE', '').strip().rstrip('/')
        self.key = os.environ.get('DONGJIEXI_MODEL_API_KEY', '').strip()
        self.model = os.environ.get('DONGJIEXI_MODEL_ID', '').strip()
        self.opener = urllib.request.build_opener(NoRedirect())
        self.cached = None
        self.checked_at = 0

    def configured(self):
        url = urlparse(self.base)
        return bool(self.enabled and self.key and self.model and url.scheme == 'https'
                    and url.hostname and not url.username and not url.password and not url.query and not url.fragment)

    def request(self, path, payload=None):
        if not self.configured():
            raise ValueError('云端模型尚未配置完整，请由管理员设置 HTTPS 接口、模型名称和服务端密钥。')
        return urllib.request.Request(self.base + path,
            data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode(),
            headers={'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})

    def health(self):
        if self.cached is not None and time.monotonic() - self.checked_at < 20:
            return dict(self.cached)
        available = False
        if self.configured():
            try:
                with self.opener.open(self.request('/models'), timeout=8) as response:
                    data = json.loads(response.read(1024 * 1024))
                available = any(item.get('id') == self.model for item in data.get('data', []) if isinstance(item, dict))
            except (OSError, ValueError):
                pass
        self.cached = {'available': available, 'models': [self.model] if available else [],
                       'installed': self.configured(), 'remote': True, 'provider': 'chat-completions',
                       'vision': False, 'configured': self.configured()}
        self.checked_at = time.monotonic()
        return dict(self.cached)

    def stream(self, job, payload, cancelled):
        if payload.get('model') != self.model:
            raise ValueError('所选模型不在云端允许列表中。')
        messages = payload['messages']
        if any(message.get('images') for message in messages):
            raise ValueError('当前云端适配器只支持文字解题，图片请先转录并核对。')
        body = {'model': self.model, 'messages': messages, 'stream': True,
                'max_tokens': min(10000, payload.get('options', {}).get('num_predict', 10000))}
        if payload.get('format'):
            body['response_format'] = {'type': 'json_object'}
        output, size, complete = [], 0, False
        deadline = time.monotonic() + 600
        try:
            with self.opener.open(self.request('/chat/completions', body), timeout=45) as response:
                job['connection'] = response
                while True:
                    if job['cancel'].is_set():
                        raise cancelled()
                    if time.monotonic() > deadline:
                        raise ValueError('云端推理超时，请缩短题目后重试。')
                    line = response.readline(1024 * 1024 + 1)
                    if not line:
                        break
                    if len(line) > 1024 * 1024:
                        raise ValueError('云端响应片段过长。')
                    if not line.startswith(b'data:'):
                        continue
                    event = line[5:].strip()
                    if event == b'[DONE]':
                        break
                    data = json.loads(event)
                    if data.get('error'):
                        raise ValueError('云端模型请求失败，请由管理员检查服务额度和配置。')
                    for choice in data.get('choices', []):
                        reason = choice.get('finish_reason')
                        if reason and reason != 'stop':
                            raise ValueError('云端模型未完整生成答案，可能达到输出上限或服务限制。')
                        complete = complete or reason == 'stop'
                        chunk = choice.get('delta', {}).get('content') or ''
                        if not isinstance(chunk, str):
                            raise ValueError('云端响应格式无效。')
                        size += len(chunk)
                        if size > 100000:
                            raise ValueError('云端答案过长，请分问解答。')
                        output.append(chunk)
                        job['phase'] = f'云端正在整理解答 · {size} 字符'
            if not complete or not ''.join(output).strip():
                raise ValueError('云端响应中断或为空，没有将不完整内容作为答案。')
            return ''.join(output)
        except urllib.error.HTTPError as error:
            if error.code == 429:
                raise ValueError('云端额度或并发已满，请稍后重试，也可自愿使用本机模型。') from None
            raise ValueError('云端模型请求失败，请由管理员检查服务配置。') from None
        except OSError:
            raise ValueError('云端模型连接失败或超时，请稍后重试。') from None
