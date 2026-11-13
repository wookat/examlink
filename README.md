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
python service.py        # 或 pythonw service.py (Windows 无窗口)
```

手机连同一 Wi-Fi，浏览器打开终端打印的 `http://<IP>:8791/?t=<token>` 链接（或 `/api/qr.png` 二维码）。

## 功能

- **自动触发**：监控 ROI 区域像素差异，画面稳定后自动截图答题；可调灵敏度/稳定等待/冷却
- **手动触发**：手机上"截屏答题""仅截图"按钮
- **ROI 框选**：在实时预览上拖动画出监控区域，只监控/只截取该区域（省 token、防无关触发）
- **多供应商**：OpenAI / 豆包 / 通义 / 智谱 / Kimi / Gemini / OpenRouter / Ollama / 自定义，均走 OpenAI 兼容接口
- **答题场景**：通用 / 选择题 / 编程题 / 英语 / 填空简答
- **追问**：同一会话内继续提问（代理模式由服务端保历史，直连模式由手机保历史）
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

## 注意

- 自动触发基于像素差异，整屏监控时系统时钟/通知也会触发——**强烈建议框选题目区域**
- 直连模式依赖模型服务支持浏览器跨域（CORS）；不支持时用代理模式
- 截图含屏幕内容，请只在可信局域网使用
