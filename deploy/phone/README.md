# 安卓备用机部署（Termux）

此目录把现有 Python 后端与手机本地 llama.cpp 模型连接起来，不将家用电脑作为服务器。

目前使用官方 Qwen3-4B Q4_K_M GGUF（2,497,280,256 字节，SHA-256：`7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`）和 Termux `llama-cpp`。手机端只监听 `127.0.0.1:8765`；模型只监听 `127.0.0.1:8080`。`configure.sh` 在手机私有目录生成两枚随机口令，绝不能提交 `private.env`。

安装顺序：

1. 从 Termux 官方 GitHub 发布页安装同一签名源的 Termux 与 Termux:Boot，并首次打开二者。
2. 在 Termux 安装 `python llama-cpp cloudflared`，再运行 `python -m pip install sympy==1.14.0`。
3. 将项目的 `server.py`、`cloud_inference.py`、`learning_engine.py`、`verification_engine.py`、`version.json`、`dist/` 和本目录脚本放到 `$HOME/dongjiexi/`。
4. 运行 `bash configure.sh`，再运行 `bash download-model.sh`。下载可断点续传；完成前须检查文件大小。
   若要另行下载 DeepSeek-R1 8B，可安装 Termux 的 `aria2` 后运行 `bash launch-download-deepseek-fast.sh`；它支持多连接与断点续传，并在完成后校验 SHA-256。下载完成不代表适合作默认云端模型，仍须实测推理速度与正确率。
5. 运行 `bash start.sh`，或运行 `bash launch-detached.sh` 在手机后台启动；在手机本机检查 `http://127.0.0.1:8765/api/health`。首次推理较慢，先用短题测试。
   当前 llama.cpp 可将私有配置中的 `DONGJIEXI_MODEL_JSON_MODE` 设为 `llama-schema`，让快速解题的 `parts` 输出遵循精简 JSON Schema；外部 OpenAI 兼容 API 应按其提供商能力分别选择 JSON 模式。运行 `bash benchmark-solve.sh` 可以在手机本地计时，不会打印口令。
6. 如需重启后自动运行，将 `boot.sh` 复制到 `$HOME/.termux/boot/start-dongjiexi` 并设为可执行；手机系统还须允许 Termux 和 Termux:Boot 自启动并关闭严格省电限制。

网页的 GitHub Pages 与手机 API 分域。要让朋友稳定访问，需要给手机 API 配置**固定 HTTPS 域名和持久隧道**，然后将该 API 地址写入网站运行配置并发布；临时 `trycloudflare.com` 地址仅供联调，不是正式部署。网页静态部分在手机离线时仍可使用，但 AI 解题会不可用。

当前联调阶段已安装地址监控：`launch-endpoint-monitor.sh` 启动 `monitor-phone-endpoint.sh`，隧道重连时 `sync-phone-endpoint.sh` 只更新本仓库的 `deploy/active-phone-api.txt`，由 GitHub Actions 重建网页配置。手机使用仓库专属可写 deploy key；私钥只应留在手机的 `$HOME/.ssh/dongjiexi_deploy`，不得提交。`boot.sh` 会启动监控和解题服务。该机制可自动恢复临时地址，但仍受 Cloudflare Quick Tunnel 可用性、GitHub Actions 发布时延及手机联网/供电影响，不等同于固定域名和正式 SLA。

加速实测（2026-09-28，iQOO Neo8 Pro）：切换 Termux 的 `vulkan-loader-android` 后，`llama-server --list-devices` 能识别 Mali-G715-Immortalis MC11。Qwen3-4B Q4_K_M 的合成测试在全 GPU 下生成速度约 6.55 token/秒，但同一道短椭圆题的完整解题耗时约 118 秒、首次输出约 83 秒，反而慢于先前 CPU 的约 70 秒。因此默认明确使用 `-ngl 0`；不要仅凭 GPU token/秒宣称网页解题加速。未来更换设备或推理程序时，应以完整题目和答案校验重新测试。

如需更快的复杂题解答，可在手机私有 `private.env` 中按 `deepseek.env.example` 配置 DeepSeek 官方 HTTPS API；`start.sh` 会跳过本地模型装载，手机仅承担认证和结果校验，不进行大模型计算。快速解题请求显式关闭深度思考，深入推导请求开启；网页和仓库永远不存放上游 API 密钥。该模式只有管理员完成 DeepSeek 平台开户、额度和 API 密钥配置后才可启用；未取得凭证前保留本地 Qwen 服务。

4B 模型能力有限，不承诺所有高考压轴题都可正确解答；现有答案验证流程仍必须保留。该文本模型不支持图片视觉推理，图片识题需另接 OCR 或视觉模型。

2026-09-28 手机实测：DeepSeek-R1-Distill-Qwen-8B Q4_K 在现有 CPU 推理程序上约每秒生成 3 个 token，短椭圆题超过 240 秒仍未完成；Qwen3-4B 同题在 JSON Schema 输出模式下约 70 秒完成。因此暂保留 Qwen3-4B 为默认模型。DeepSeek 文件保留，可在 GPU/NPU 后端可用时重新测试；模型体积或可用内存增大本身不会提升 CPU 推理速度。`benchmark-solve.sh` 现在会输出测试题的答案，升级默认模型前须同时核对耗时与答案正确性。
