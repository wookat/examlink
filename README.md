# examlink

局域网屏幕截图 + AI 答题服务。考试电脑上运行后，手机/另一台电脑浏览器扫码即可：实时预览、框选监控区域、手动截图、AI 多模态答题、像素差异自动触发。

## 架构

```
考试电脑                          手机/第二台电脑
pythonw service.py  <──LAN/WS──>  浏览器打开网页
  ├─ mss 截屏 + numpy ROI 像素差异    ├─ 实时画面预览
  ├─ FastAPI + 单页 WebApp          ├─ 框选 ROI / 手动截图
  └─ OpenAI 兼容代理(可选)            └─ AI 对话 / 历史 / 设置
```

两种 AI 模式：
- **代理模式**：API Key 存在考试电脑 config.json，服务端转发模型请求（手机只收答案）
- **直连模式**：API Key 只存在手机浏览器 localStorage，截图传到手机后由浏览器直接调模型——考试电脑完全不接触 Key

## 快速开始

```bash
pip install -r requirements.txt
python main.py           # 或 pythonw main.py (Windows 无窗口)
```

手机连同一 Wi-Fi，浏览器打开终端打印的 `http://<IP>:8791/?t=<token>` 链接（或 `/api/qr.png` 二维码）。

## 打包分发（免 Python）

```bat
build.bat                :: 产出 dist\examlink.exe，单文件约 41MB
```

把 `dist\examlink.exe` 拷给任何 Windows 机器，双击即用，**无需安装 Python/依赖**。首次运行自动在 exe 旁生成 `config.json`（含随机 token），`knowledge.md`、`history.json` 同样写在 exe 旁边——**exe 必须放在可写目录**（不要放 Program Files）。web 资源和示例配置已打进包内。

分发建议：只发 `examlink.exe` 一个文件即可；`config.example.json` 已在包内作为默认值模板，用户的一切配置都在网页设置页里改。

## 浏览器扩展（extension/）— 免 API Key 模式

MV3 扩展，不调用任何 API：**直接把截图+提示词投送到你已登录的 AI 网页**（ChatGPT / 豆包 / Gemini / DeepSeek / Kimi），抓回的回答在侧边栏大屏显示。

```
考试电脑/第二电脑                  AI 网页标签页（你已登录）
examlink 服务 (可选, 截图源)
  └─ /api/frame.jpg ──> 扩展后台 ──> 内容脚本贴图+输字+提交 ──> 答案流回侧边栏
```

安装：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/` 目录。点工具栏图标开侧边栏。

- **截图来源**：examlink 服务（`/api/frame.jpg`，可只截 ROI）或 当前可见标签页
- **站点自动化**：文件输入/drop/paste 三种贴图策略 + ProseMirror 兼容输入 + 发送 → MutationObserver 抓回答案流
- **大屏显示**：答案卡片大字渲染，字号 14–40px 无级调节，可弹出独立窗口放第二屏
- 站点选择器会随 AI 网页改版失效——失效时改 `content/inject.js` 里的 `ADAPTERS` 选择器表

## 功能

- **自动触发**：监控 ROI 区域像素差异，画面稳定后自动截图答题；可调灵敏度/稳定等待/冷却
- **手动触发**：手机上"截屏答题""仅截图"按钮
- **ROI 框选**：在实时预览上拖动画出监控区域，只监控/只截取该区域（省 token、防无关触发）
- **多供应商**：OpenAI / 豆包 / 通义 / 智谱 / Kimi / Gemini / OpenRouter / Ollama / 自定义，均走 OpenAI 兼容接口
- **答题场景**：通用 / 选择题 / 编程题 / 英语 / 填空简答
- **追问**：同一会话内继续提问（代理模式由服务端保历史，直连模式由手机保历史）
- **视线布局**：正视/左侧视/右侧视/远视预设——答案列贴到离你最近的屏幕边缘，远视=超大字只看最新答案；内容对齐+宽度+字号均可调；高对比黑底白字模式
- **快捷键**：考试电脑全局热键（F 键/PrintScreen/鼠标中键/侧键X1X2/**滚轮**/组合键，pynput 全局监听），动作含截屏答题/仅截图/上下题/上下滚——滚轮翻页可直接控制第二屏；答题页可为本设备录制按键/鼠标键
- **逐题导航**：答案卡片滚动吸附，方向键/PageUp/Down/侧键/浮动 ‹› 按钮逐题切换；WS `nav` 事件支持远程翻页
- **高清截图**：jpeg 质量 60–100、最大边长 1200–4096 可调
- **安全**：URL token 配对；默认绑定 0.0.0.0 仅供局域网使用

## 配置 (config.json)

| 字段 | 说明 |
|---|---|
| port | 服务端口，默认 8791 |
| token | 配对 token，留空自动生成 |
| monitor | 显示器编号（1=主） |
| roi | 归一化监控区域 [x0,y0,x1,y1]，null=全屏 |
| auto.* | enabled/poll_ms/stable_ms/cooldown_s/threshold/thumb_w/thumb_h |
| proxy.* | 代理模式 provider/base_url/api_key/model |
| ai_mode | proxy / direct |
| scene | 默认答题场景 |
| hotkey.items | 考试电脑全局热键 `[{action,trigger}]`：action=capture/snap/nav_next/nav_prev/nav_down/nav_up；trigger=`key:f9` / `mouse:middle` / `mouse:wheel_down` / `combo:ctrl+shift+q` … |
| jpeg_quality / max_image_dim | 截图 JPEG 质量（默认 92）/ 最大边长（默认 3000） |

## HTTP API（供外部客户端/扩展使用）

| 端点 | 说明 |
|---|---|
| `GET /api/state?token=` | 显示器/ROI/场景/提示词等状态 |
| `GET /api/frame.jpg?token=[&roi=1]` | 单帧截图 JPEG（`roi=1` 按配置裁剪） |
| `GET /preview.mjpg?token=` | MJPEG 实时预览流 |
| `GET /api/qr.png?token=` | 配对链接二维码 |
| `WS /ws?token=` | 双向命令/事件通道（capture/ask/set/abort/clear/shutdown） |

## 注意

- 自动触发基于像素差异，整屏监控时系统时钟/通知也会触发——**强烈建议框选题目区域**
- 直连模式依赖模型服务支持浏览器跨域（CORS）；不支持时用代理模式
- 截图含屏幕内容，请只在可信局域网使用
