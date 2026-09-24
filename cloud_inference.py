"""Server-only Chat Completions adapter. No credentials or arbitrary URLs from clients."""
import json
import os
import time
import base64
import binascii
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
        self.json_mode = os.environ.get('DONGJIEXI_MODEL_JSON_MODE', 'json_object').strip()
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
                available = any(item.get('id') in {self.model, 'models/' + self.model} for item in data.get('data', []) if isinstance(item, dict))
            except (OSError, ValueError):
                pass
        self.cached = {'available': available, 'models': [self.model] if available else [],
                       'installed': self.configured(), 'remote': True, 'provider': 'chat-completions',
                       'vision': available, 'configured': self.configured()}
        self.checked_at = time.monotonic()
        return dict(self.cached)

    def stream(self, job, payload, cancelled):
        if payload.get('model') != self.model:
            raise ValueError('所选模型不在云端允许列表中。')
        messages = []
        for message in payload['messages']:
            images = message.get('images') or []
            if not images:
                messages.append(message)
                continue
            content = [{'type': 'text', 'text': str(message.get('content', ''))}]
            for encoded in images:
                if not isinstance(encoded, str) or len(encoded) > 12 * 1024 * 1024:
                    raise ValueError('题图过大或格式无效。')
                try:
                    raw = base64.b64decode(encoded, validate=True)
                except (ValueError, binascii.Error):
                    raise ValueError('题图编码无效。') from None
                if len(raw) > 8 * 1024 * 1024:
                    raise ValueError('题图请压缩至 8 MB 以内。')
                mime = ('image/png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else
                        'image/jpeg' if raw.startswith(b'\xff\xd8\xff') else
                        'image/webp' if raw.startswith(b'RIFF') and raw[8:12] == b'WEBP' else None)
                if not mime:
                    raise ValueError('仅支持 PNG、JPEG 或 WebP 题图。')
                content.append({'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{encoded}'}})
            messages.append({'role': message.get('role'), 'content': content})
        body = {'model': self.model, 'messages': messages, 'stream': True,
                'max_tokens': min(10000, payload.get('options', {}).get('num_predict', 10000))}
        if payload.get('format') and self.json_mode != 'prompt-only':
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
            if error.code == 403:
                raise ValueError('云端模型拒绝请求：可能是免费额度用尽、模型权限不足或密钥地域不匹配；请管理员检查百炼控制台。') from None
            raise ValueError('云端模型请求失败，请由管理员检查服务配置。') from None
        except OSError:
            raise ValueError('云端模型连接失败或超时，请稍后重试。') from None
