# 安卓服务网关部署（Termux）

0.41.3：`service-supervisor.py` 每 15 秒检查本地与公网健康，连续故障后分别重启服务或隧道，并按 15/30 秒到 5 分钟退避。监控不调用模型推理，不产生解题费用；公网健康成功才同步地址。停止进程前验证目录、命令和独立会话，监控本身通过文件锁保持单实例。健康恢复不代表所有答案已核验。

持久隧道可将固定 HTTPS 源地址写入手机私有 `cloud-endpoint.txt`，将 Cloudflare 的隧道令牌写入权限为 600 的 `cloudflared.token`。`launch-tunnel.sh` 使用 `--token-file` 启动，避免令牌出现在进程参数或公开仓库；Cloudflare 控制台还需配置该域名转发到 `http://127.0.0.1:8765`。缺少任一文件时拒绝降级到随机地址。没有持久配置时仍走测试隧道，不承诺长期可用。

正式网页为 https://dongjiexi.github.io/-/。既有网关须把新站点源加入私有 `DONGJIEXI_ALLOWED_ORIGINS`，保留原密钥及访问口令；不要重新运行配置脚本生成新口令。独立云端部署在控制台私密设置访问口令，不能使用随机生成值替换约定口令；Render 免费实例会休眠，正式常驻服务需另行确认计费套餐。

此目录把现有 Python 后端与手机本地 llama.cpp 模型连接起来，不将家用电脑作为服务器。

本机模式使用基于 Llama 的 DeepSeek-R1-Distill-Llama-8B Q4_K_M GGUF（4,920,736,608 字节，SHA-256：`87bcba20b4846d8dadf753d3ff48f9285d131fc95e3e0e7e934d4f20bc896f5d`）和 Termux `llama-cpp`。手机端只监听 `127.0.0.1:8765`；模型只监听 `127.0.0.1:8080`。`configure.sh` 在手机私有目录生成两枚随机口令，绝不能提交 `private.env`。

安装顺序：

1. 从 Termux 官方 GitHub 发布页安装同一签名源的 Termux 与 Termux:Boot，并首次打开二者。
2. 在 Termux 安装 `python llama-cpp cloudflared`，再运行 `python -m pip install sympy==1.14.0`。
3. 将项目的 `server.py`、`cloud_inference.py`、`learning_engine.py`、`verification_engine.py`、`version.json`、`dist/` 和本目录脚本放到 `$HOME/dongjiexi/`。
4. 运行 `bash configure.sh`，再运行 `bash download-model.sh`。下载可断点续传；完成前须检查文件大小。
   可安装 Termux 的 `aria2` 后运行 `bash launch-download-deepseek-fast.sh`；它支持多连接与断点续传，完成后校验 SHA-256，并且只在新模型校验成功后删除旧本机模型。
5. 运行 `bash start.sh`，或运行 `bash launch-detached.sh` 在手机后台启动；在手机本机检查 `http://127.0.0.1:8765/api/health`。首次推理较慢，先用短题测试。
   当前 llama.cpp 可将私有配置中的 `DONGJIEXI_MODEL_JSON_MODE` 设为 `llama-schema`，让快速解题的 `parts` 输出遵循精简 JSON Schema；外部 OpenAI 兼容 API 应按其提供商能力分别选择 JSON 模式。运行 `bash benchmark-solve.sh` 可以在手机本地计时，不会打印口令。
6. 如需重启后自动运行，将 `boot.sh` 复制到 `$HOME/.termux/boot/start-dongjiexi` 并设为可执行；手机系统还须允许 Termux 和 Termux:Boot 自启动并关闭严格省电限制。

网页的 GitHub Pages 与手机 API 分域。要让朋友稳定访问，需要给手机 API 配置**固定 HTTPS 域名和持久隧道**，然后将该 API 地址写入网站运行配置并发布；临时 `trycloudflare.com` 地址仅供联调，不是正式部署。网页静态部分在手机离线时仍可使用，但 AI 解题会不可用。

当前联调阶段已安装地址监控：`launch-endpoint-monitor.sh` 启动 `monitor-phone-endpoint.sh`，隧道重连时 `sync-phone-endpoint.sh` 只更新本仓库的 `deploy/active-phone-api.txt`，由 GitHub Actions 重建网页配置。手机使用仓库专属可写 deploy key；私钥只应留在手机的 `$HOME/.ssh/dongjiexi_deploy`，不得提交。`boot.sh` 会启动监控和解题服务。该机制可自动恢复临时地址，但仍受 Cloudflare Quick Tunnel 可用性、GitHub Actions 发布时延及手机联网/供电影响，不等同于固定域名和正式 SLA。

8B 本机模型仍不承诺所有高考压轴题都可正确解答；现有答案验证流程仍必须保留。该文本模型不支持图片视觉推理，图片识题需另接 OCR 或视觉模型。

如需更快的复杂题解答，可在手机私有 `private.env` 中按 `deepseek.env.example` 配置 DeepSeek 官方 HTTPS API；`start.sh` 会跳过本地模型装载，手机仅承担认证和结果校验，不进行大模型计算。快速解题请求显式关闭深度思考，深入推导请求开启；网页和仓库永远不存放上游 API 密钥。该模式只有管理员完成 DeepSeek 平台开户、额度和 API 密钥配置后才可启用；否则可使用本机 DeepSeek-R1 Llama 服务。

开户并创建密钥后，在 Termux 中运行 `cd ~/dongjiexi && python configure-inference.py deepseek`，直接在手机上隐藏输入密钥。工具会先验证密钥、额度和模型，再原子替换私有配置并保留权限为 `600` 的时间戳备份；验证失败不会修改现有服务。随后运行 `bash restart-service.sh --rollback-on-failure`，若新服务健康检查失败会恢复上一份配置。如需主动切回，运行 `python configure-inference.py local && bash restart-service.sh`。

本机 DeepSeek-R1 Llama 8B 以正确率优先，手机 CPU 推理会明显慢于云端 DeepSeek；长期本机使用前应运行 `benchmark-solve.sh` 同时核对耗时与答案正确性。模型文件体积或可用内存增大本身不会提升 CPU 推理速度。
