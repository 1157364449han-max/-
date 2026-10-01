# Cloudflare Workers 免费解题接口

这是独立云端接口，不转发到管理员的手机或电脑。网页仍由 GitHub Pages 发布；原 Python/Docker、本机解题、画板和题库不删除。仅在云端实际验收成功后替换网页接口地址。

## 管理员部署

使用 Workers **Free** 和 D1 免费额度，不创建 Containers、付费 Workers 套餐、R2 或其它收费资源。DeepSeek 模型 API 调用仍按模型平台计费，接口免费不等于推理免费。

```sh
npx wrangler@4 login
npx wrangler@4 d1 create dongjiexi-guard
```

把返回的数据库 ID 写入 `wrangler.jsonc` 的 `database_id`。然后执行：

```sh
npx wrangler@4 d1 execute dongjiexi-guard --remote --file schema.sql
npx wrangler@4 secret put DONGJIEXI_MODEL_API_KEY
npx wrangler@4 secret put DONGJIEXI_ACCESS_KEY
npx wrangler@4 secret put SESSION_SECRET
npx wrangler@4 deploy
```

访问口令保留管理员已指定的原值，不自动生成新口令。`SESSION_SECRET` 用密码学随机生成至少 32 字节的独立秘密，不能用访问口令或 API Key 代替。秘密只经安全输入存入平台，不放入命令参数、仓库、网页、截图或提交日志。部署依赖仅供管理员使用，终端用户不需安装。

## 接口与防护

- `/api/health`：公开只返回服务状态；持有效会话才查询 DeepSeek 模型可用性。
- `/api/session`：中文口令换取一小时 HMAC 签名会话，限制口令尝试。
- `/api/stream`：仅允许配置的模型和固定 DeepSeek HTTPS 地址，拒绝重定向、任意客户端模型地址、图片直传和下载/启动命令。
- `/api/recognize`：与文字接口隔离的图片转录入口，仅支持 DeepSeek Flash；要求同一会话，沿用并发、客户端频率与每日总额度。只接受实际格式匹配的 PNG/JPEG/WebP 内联图片，单图不超过 2 MiB、请求不超过 3 MiB，不接受任意外部图片 URL。图片仅送到固定 DeepSeek 上游，不写 D1。
- 网页只在点击识别后上传；保留原图对照、LaTeX 预览与模糊位置核对。识别结果不是答案，确认后才可解题。视觉模型依据 https://api-docs.deepseek.com/guides/vision/，模型 API 识图同样计费。
- 网页根据健康信息自动选用流式接口；旧服务仍使用原有任务轮询。流式响应结束、长度超限或截断时，不安装不完整答案，保留上一份题稿。
- D1 只存经过 HMAC 的客户端标识、限流计数及并发租约，不存原始 IP、题目、答案、访问口令或模型密钥。
- 默认同一客户端每 10 分钟 4 次、全服务 UTC 每日 50 次模型请求、并发 2。换会话不能重置客户端额度。繁忙未受理不扣日次数，上游拒绝、网络错误或非 SSE 响应退回日计数；已经受理的 SSE 即使中断仍计数。客户端频率限制继续计算已受理尝试以防滥用。日次数上限不是金额上限，请同时在模型平台设置预算。
- 停止按钮中断浏览器响应；连接取消向上游流传播，但不能保证模型供应商立即停止生成或取消已产生的计费。并发租约最长 310 秒自动失效。
- 每日清理过期计数与租约。免费 D1 超额或异常时拒绝新推理请求，不绕过限流。

## 数学能力与资源边界

Worker 原样传输模型 SSE，不在每个 token 上做 JavaScript 运算。浏览器解析、检查答案/小问编号、过滤作图字段，再执行原有内置确定性解题与答案驱动作图流程。题目文字与答案均按数据处理，不能作为代码执行。

**这不是把 Python SymPy 核验器完整迁入免费 Worker。** 原 Python 引擎继续可用；浏览器已支持的题型照常精确复算。其余 AI 推导明确显示待核验，不能宣称“所有答案自动正确”。图片继续走已有浏览器 OCR；当前 DeepSeek 文本接口不新增视觉能力。

免费 CPU 上限、D1 配额、国内可达性及响应时间必须在实际账户部署后测量；本地测试不证明免费生产资源一定够用。超额会失败，不能承诺 SLA 或无限使用。

## 切换与回退

验收中文口令、错误口令、健康检测、真实题库整题/绘图、追问、停止、断流保留题稿和移动端。随后将 GitHub Actions 仓库变量 `DONGJIEXI_API_BASE` 设置为验收通过的固定 Workers 地址，优先级高于临时接口地址；重新发布网页。

若失败，将该变量恢复为先前正常接口并重新发布。不要在正式切换前关闭原服务，也不要把尚未部署的地址写入用户网页。
