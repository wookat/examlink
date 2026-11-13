"""OpenAI-compatible multimodal chat. Provider presets + streaming.

Design borrowed from:
- ExamHelper/main.py : OpenAI-compatible base_url is enough (Doubao default)
- snanswer/src/main/model-list.ts : preset providers + fetch /models
- PrepPro/windows-server/agent/model_provider.py : provider abstraction
"""

import json

# id -> preset. base_url "" means user must fill. models are suggestions.
PROVIDERS = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-5-mini"],
        "vision": True,
    },
    "doubao": {
        "name": "豆包 (火山方舟)",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "models": ["doubao-seed-1-6-250615", "doubao-1-5-vision-pro-32k-250115", "doubao-1-5-vision-lite-32k-250115"],
        "vision": True,
    },
    "qwen": {
        "name": "通义千问 (DashScope)",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen3-vl-plus", "qwen-vl-max", "qwen2.5-vl-72b-instruct"],
        "vision": True,
    },
    "zhipu": {
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4v-flash", "glm-4v-plus", "glm-4.5v"],
        "vision": True,
    },
    "kimi": {
        "name": "Kimi (Moonshot)",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k-vision-preview", "kimi-latest"],
        "vision": True,
    },
    "gemini": {
        "name": "Gemini (OpenAI兼容)",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "models": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
        "vision": True,
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": ["google/gemini-2.5-flash", "openai/gpt-4o-mini", "qwen/qwen3-vl-235b-a22b-instruct"],
        "vision": True,
    },
    "ollama": {
        "name": "Ollama 本地",
        "base_url": "http://localhost:11434/v1",
        "models": ["qwen2.5vl:7b", "llava:7b", "minicpm-v"],
        "vision": True,
    },
    "custom": {
        "name": "自定义",
        "base_url": "",
        "models": [],
        "vision": True,
    },
}

SCENES = {
    "general": "你是笔试答题专家，请按以下步骤解答截图中的题目：\n1) 先完整阅读题干，注意题目问的是\"属于\"还是\"不属于\"、\"正确\"还是\"错误\"、\"符合\"还是\"不符合\"\n2) 选择题：逐选项做简短分析后再下结论；定义判断题把定义要件逐条列出并逐选项对照；词语辨析题分析搭配对象、语义轻重、感情色彩后逐选项排除\n3) 编程题给出思路和代码；简答题给出要点\n4) 最后用一行醒目格式给出结论：**答案：X**（多选列出全部选项）\n分析过程简洁，但必须先分析再给结论，不要自相矛盾。",
    "mcq": "你是选择题答题专家，请按以下步骤解答截图中的选择题：\n1) 先完整阅读题干，明确问的是\"属于/不属于\"、\"正确/错误\"、单选还是多选\n2) 定义判断题：把定义的关键要件逐条列出，再逐选项对照每个要件，对 A/B/C/D 各写一句判断\n3) 词语辨析题：分析每个词语的搭配对象、语义轻重、感情色彩，逐选项排除\n4) 常识/计算题：给出关键推理或计算过程\n5) 最后用一行醒目格式给出结论：**答案：X**（多选列出全部选项）\n分析简洁，但必须先逐选项分析再给结论，不得与自身分析矛盾。",
    "code": "你是编程答题专家。分析截图中的编程/算法题，给出：1) 解题思路（关键算法与步骤）2) 完整可运行代码（注释清晰）3) 时间/空间复杂度分析。如果题目要求用特定语言，用该语言作答。若截图中有多个小题，逐题作答并标注题号。",
    "english": "你是英语考试助手。分析截图中的英语题目（阅读/完形/翻译/作文）：选择题逐选项给出判断和依据；翻译题给出准确译文；作文题给出结构完整的参考范文。先用中文简述分析，再给出答案。",
    "fill": "你是笔试答题助手。分析截图中的题目，给出可直接填写的答案：填空题给出填空内容（注意语法搭配）；简答题/名词解释给出条理清晰的答案要点，分点列出。结论用 **答案：** 标出。",
}


def provider_cfg(cfg):
    """Resolve effective provider config (preset merged with user overrides)."""
    p = cfg.get("proxy", {})
    preset = PROVIDERS.get(p.get("provider", "custom"), PROVIDERS["custom"])
    return {
        "name": p.get("custom_name") or preset["name"],
        "base_url": (p.get("base_url") or preset["base_url"]).rstrip("/"),
        "api_key": p.get("api_key", ""),
        "model": p.get("model") or (preset["models"][0] if preset["models"] else ""),
        "vision": preset.get("vision", True),
    }


def scene_prompt(scene_id):
    return SCENES.get(scene_id, SCENES["general"])


def image_part(b64, mime="image/jpeg"):
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def text_part(text):
    return {"type": "text", "text": text}


async def stream_chat(messages, prov_cfg):
    """Async generator yielding text chunks. Raises on error."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        base_url=prov_cfg["base_url"] or None,
        api_key=prov_cfg["api_key"] or "not-needed",
        timeout=120.0,
    )
    stream = await client.chat.completions.create(
        model=prov_cfg["model"],
        messages=messages,
        stream=True,
        max_tokens=4096,
    )
    async for ev in stream:
        try:
            delta = ev.choices[0].delta
            piece = getattr(delta, "content", None) or ""
            if piece:
                yield piece
        except (AttributeError, IndexError):
            continue


def build_user_content(question, image_b64s):
    """question str + list of b64 -> multimodal content parts."""
    parts = []
    for b64 in image_b64s:
        parts.append(image_part(b64))
    if question:
        parts.append(text_part(question))
    elif not parts:
        parts.append(text_part("请分析这张截图并给出答案。"))
    return parts


def list_models(prov_cfg):
    """Best-effort fetch /models (OpenAI-compatible). Returns list[str]."""
    import urllib.request
    url = prov_cfg["base_url"].rstrip("/") + "/models"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {prov_cfg['api_key']}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return [m.get("id", "") for m in data.get("data", []) if m.get("id")]
    except Exception:
        return []
