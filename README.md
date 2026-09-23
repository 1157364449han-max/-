# 董解析

面向高中生与教师的中文解析几何工作台。题目、分步解答、动态画板、参数、图层与课堂展示使用同一套场景数据。

当前版本：**0.23.1**。仓库中的部署状态以 [Actions](https://github.com/1157364449han-max/-/actions) 的实际结果为准，上传源码不代表网页已经上线。

## 使用能力与边界

0.23.1 增加 [Render 部署蓝图](render.yaml)，可把现有后端部署为独立云服务，并连接 Google AI Studio 的 Gemini 兼容接口。首次创建仍需账号本人登录、验证并将密钥只填写在 Render Secret；当前公开站尚未连接真实云服务。

0.23.0 新增独立云 API 后端代码，配置完成后以云端 AI 处理整题，原有本机模型仍可自愿安装使用。当前公开站没有配置真实云服务，不代表通用 AI 已上线。参见 [部署说明](deploy/部署说明.md)；真实密钥只放云平台 Secret。

- 内置已覆盖题型的确定性解题：由条件反求曲线、交点、弦、中点、曲线上点处的切线和法线、焦点弦与部分精确轨迹。
- 原生画板支持圆与三类圆锥曲线追加、参数模板、通用数学键盘、原位编辑、吸附、关联动点/动线、图层与小问显示、撤销重做。
- 学生逐步提示、题本笔记、教师讲题模式、批注、导入导出与打印。
- 静态 Web/PWA 可在电脑、手机浏览器运行，无须用户安装 Python、模型或其它运行环境，也不需要维护者电脑充当服务器。

不是任意高中难题的完整证明器。未覆盖目标会提示仍需推理；机器核验只保证列出的复算项目。圆与轴对齐椭圆的外点切线已使用通用公式计算；其它曲线的外点切线、通用曲线两两求交仍待扩展。静态网页不自带开放题 AI 推理与图片识别；这些可选功能需要单独的云端服务，不能把 API 密钥放进前端。

0.22.0 提供统一 LaTeX 显示：文本支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]`；主方程、建图模板与参数输入有公式预览。编辑框和导出的 JSON 保留原文。数学排版不等于符号求解覆盖，不能解析的表达式仍需明确补充条件。Canvas 内的普通点名仍使用原生文字绘制。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `dist/` | 可直接部署的中文前端、内置解题、Canvas 画板、PWA 与公式资源 |
| `server.py`、`learning_engine.py`、`verification_engine.py` | 可选本机/云端服务、精确计算与独立核验 |
| `tests/` | 数学与安全契约、发布构建、真实浏览器回归 |
| `deploy/build_release.py` | 同版本网页与桌面更新包生成、白名单与校验和 |
| `.github/workflows/deploy-dongjiexi.yml` | 测试通过后构建并部署 GitHub Pages |

开发者可使用 Python 3.12+、`pip install -r requirements.txt` 后运行 `python server.py`。这些仅是本机开发/服务端依赖，不是公网用户的安装要求。桌面 ZIP 是原 Python 程序的更新包，不是免安装 EXE。

## 验证与发布

```sh
python -m unittest discover -s tests -p '*_tests.py'
node tests/native_geometry_tests.cjs
node tests/browser_contract_tests.cjs
node tests/pwa_contract_tests.cjs
npm install --no-save --no-package-lock playwright@1.62.1
npx playwright install --with-deps chromium
node tests/run_browser_smoke.cjs
python deploy/build_release.py --output _release --site-base https://1157364449han-max.github.io/-
```

`_release/site/` 是静态网站；默认不向本机或任何未配置云服务发送解题请求。Pages 需要仓库具备相应托管资格且已启用 GitHub Actions 来源。发布后 PWA 提示刷新，同次发布生成桌面更新包；设备更新版本不等于个人题本自动跨设备同步，题本目前通过导入导出迁移。

详见 [使用说明](使用说明.md)、[更新日志](更新日志.md) 和 [部署说明](deploy/部署说明.md)。KaTeX 及字体的许可保留在 `dist/vendor/katex/LICENSE`；公开代码不改变第三方资源的原有许可。
