"""Bounded, shared question-part parsing without confusing citations with headings."""
from __future__ import annotations

import re

MAX_TEXT = 18000
MAX_PARTS = 12
ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8}
TOKEN = r"(?:\d{1,2}|viii|vii|vi|iv|v|iii|ii|i)"


class QuestionPartsError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _checked_text(text: str) -> str:
    if not isinstance(text, str):
        raise QuestionPartsError("QUESTION_PARTS_TEXT", "题目必须是文字。")
    if len(text) > MAX_TEXT:
        raise QuestionPartsError("QUESTION_PARTS_LENGTH", f"题目超过 {MAX_TEXT} 字符，请缩短或分题输入。")
    return text


def _strip_wrap(value: str) -> str:
    return re.sub(r"(?:\$|\\\(|\\\)|\\\[|\\\])+", "", value)


def _heading(text: str, start: int, end: int) -> bool:
    before, after = _strip_wrap(text[max(0, start-160):start]), _strip_wrap(text[end:end+180])
    left, right = before.rstrip(), after.lstrip()
    if re.match(r"[+\-*/^=<>≤≥),%\d]", right):
        return False
    if re.match(r"[（(]\s*"+TOKEN+r"\s*[）)]", right, re.I) or re.search(r"[（(]\s*"+TOKEN+r"\s*[）)]\s*$", left, re.I):
        return False
    if re.match(r"(?:的?(?:条件|结论|结果|基础|假设|范围|小问)|问(?:[。；;,，）)]|$)|中(?:的|所得|所求|给出|提到|求)|所得|所求|给出|提到|可知|可得|成立|所示|与|和|、|及|或|至|到)", right):
        return False
    line_start = max(text.rfind("\n", 0, start), text.rfind("\r", 0, start))+1
    if re.fullmatch(r"(?:\s|\$|\\[()\[\]])*", text[line_start:start]):
        return True
    if re.search(r"[A-Za-z0-9_√π*/^+=-]\s*$", left):
        return False
    if re.search(r"(?:在|由|根据|依据|利用|结合|参见|见|第|前述|上述|小问|问题|题|求出|求|证明|式|编号|条件)\s*$", left):
        return False
    if re.search(r"[。；;:：!?！？]\s*$", left):
        return True
    return bool(re.match(r"(?:求|证明|求证|若|当|设|已知|写出|确定|计算|讨论|判断|说明|试|找出|给出|建立|作|研究|分析|选择|是否|在|椭圆|双曲线|抛物线|圆|直线|点|函数|数列|矩形|三角形|向量)", right))


def _scan(text: str, roman: bool = False) -> list[dict]:
    pattern = r"[（(]\s*(viii|vii|vi|iv|v|iii|ii|i)\s*[）)]" if roman else r"[（(]\s*(\d{1,2})\s*[）)]"
    result = []
    for match in re.finditer(pattern, text, re.I if roman else 0):
        if not _heading(text, match.start(), match.end()):
            continue
        number = match.group(1).lower() if roman else int(match.group(1))
        if not roman and number < 1:
            continue
        result.append({"index": match.start(), "end": match.end(), "number": number, "raw": match.group(0)})
    return result


def headings(text: str) -> list[dict]:
    return _scan(_checked_text(text))


def split_problem_parts(text: str) -> list[dict]:
    text = _checked_text(text)
    matches = _scan(text)
    if not matches:
        body = text.strip()
        return [{"index": 0, "label": "完整题目", "question": body, "body": body}]
    parents = set()
    for heading in matches:
        if heading["number"] in parents:
            raise QuestionPartsError("QUESTION_PARTS_DUPLICATE", f"题目包含重复小问编号（{heading['number']}），请修正编号后重试。")
        parents.add(heading["number"])
    preamble, parts = text[:matches[0]["index"]].strip(), []
    for i, heading in enumerate(matches):
        end = matches[i+1]["index"] if i+1 < len(matches) else len(text)
        segment, number = text[heading["end"]:end], heading["number"]
        nested = _scan(segment, True)
        if not nested:
            body = segment.strip()
            parts.append({"index": number, "label": f"第（{number}）问", "question": (preamble+"\n"+body).strip(), "body": body})
            continue
        setup, seen = segment[:nested[0]["index"]].strip(), set()
        for j, sub in enumerate(nested):
            if sub["number"] in seen:
                raise QuestionPartsError("QUESTION_PARTS_DUPLICATE", f"题目包含重复小问编号（{number}）（{sub['number']}），请修正编号后重试。")
            seen.add(sub["number"])
            sub_end = nested[j+1]["index"] if j+1 < len(nested) else len(segment)
            sub_body = segment[sub["end"]:sub_end].strip()
            body = (setup+"\n"+sub_body).strip() if setup else sub_body
            parts.append({"index": number*100+ROMAN[sub["number"]], "label": f"第（{number}）（{sub['number']}）问", "question": (preamble+"\n"+body).strip(), "body": body, "parent_index": number, "sub_index": sub["number"]})
    if len(parts) > MAX_PARTS:
        raise QuestionPartsError("QUESTION_PARTS_MAX", f"题目共有 {len(parts)} 个小问，超过最多 {MAX_PARTS} 个的限制，请分题输入。")
    return parts
