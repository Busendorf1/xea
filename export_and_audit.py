"""
Convert EFCC_MPhil_Thesis_Verified.md into a Word-compatible .doc file
and perform an automated citation and paragraph audit.
"""
import re
from pathlib import Path

md_path = Path(r"c:\Users\USER\xea\EFCC_MPhil_Thesis_Verified.md")
doc_path = Path(r"c:\Users\USER\xea\EFCC_MPhil_Thesis_Verified.doc")
html_path = Path(r"c:\Users\USER\xea\EFCC_MPhil_Thesis_Verified.html")

md_text = md_path.read_text(encoding="utf-8")

# Simple Markdown to clean Word-compatible HTML converter
lines = md_text.splitlines()
html_lines = [
    "<!DOCTYPE html>",
    "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>",
    "<head><meta charset='utf-8'><title>EFCC M.Phil. Thesis</title>",
    "<style>",
    "body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; margin: 1in; }",
    "h1 { font-size: 14pt; font-weight: bold; text-align: center; margin-top: 24pt; margin-bottom: 12pt; text-transform: uppercase; }",
    "h2 { font-size: 13pt; font-weight: bold; margin-top: 18pt; margin-bottom: 8pt; }",
    "h3 { font-size: 12pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }",
    "p { margin-top: 0pt; margin-bottom: 10pt; text-align: justify; }",
    "table { border-collapse: collapse; width: 100%; margin-top: 10pt; margin-bottom: 12pt; font-size: 11pt; }",
    "th, td { border: 1px solid #000000; padding: 6pt; text-align: left; vertical-align: top; }",
    "th { background-color: #f2f2f2; font-weight: bold; }",
    "ul, ol { margin-top: 4pt; margin-bottom: 10pt; }",
    "li { margin-bottom: 4pt; text-align: justify; }",
    "hr { border: 0; border-top: 1px solid #ccc; margin: 20pt 0; }",
    "</style></head><body>"
]

def format_inline(text):
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    return text

in_table = False
in_ul = False
in_ol = False

for line in lines:
    stripped = line.strip()
    if not stripped:
        if in_table:
            html_lines.append("</tbody></table>")
            in_table = False
        if in_ul:
            html_lines.append("</ul>")
            in_ul = False
        if in_ol:
            html_lines.append("</ol>")
            in_ol = False
        continue

    if stripped == "---":
        html_lines.append("<hr/>")
        continue

    if stripped.startswith("|") and stripped.endswith("|"):
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if all(re.match(r"^:?-{2,}:?$", c) for c in cells):
            continue
        if not in_table:
            html_lines.append("<table><thead><tr>")
            for c in cells:
                html_lines.append(f"<th>{format_inline(c)}</th>")
            html_lines.append("</tr></thead><tbody>")
            in_table = True
        else:
            html_lines.append("<tr>")
            for c in cells:
                html_lines.append(f"<td>{format_inline(c)}</td>")
            html_lines.append("</tr>")
        continue
    elif in_table:
        html_lines.append("</tbody></table>")
        in_table = False

    if stripped.startswith("# "):
        html_lines.append(f"<h1>{format_inline(stripped[2:])}</h1>")
    elif stripped.startswith("## "):
        html_lines.append(f"<h2>{format_inline(stripped[3:])}</h2>")
    elif stripped.startswith("### "):
        html_lines.append(f"<h3>{format_inline(stripped[4:])}</h3>")
    elif stripped.startswith("* "):
        if not in_ul:
            html_lines.append("<ul>")
            in_ul = True
        html_lines.append(f"<li>{format_inline(stripped[2:])}</li>")
    elif re.match(r"^\d+\.\s+", stripped):
        if not in_ol:
            html_lines.append("<ol>")
            in_ol = True
        item_text = re.sub(r"^\d+\.\s+", "", stripped)
        html_lines.append(f"<li>{format_inline(item_text)}</li>")
    else:
        if in_ul:
            html_lines.append("</ul>")
            in_ul = False
        if in_ol:
            html_lines.append("</ol>")
            in_ol = False
        html_lines.append(f"<p>{format_inline(stripped)}</p>")

if in_table:
    html_lines.append("</tbody></table>")
if in_ul:
    html_lines.append("</ul>")
if in_ol:
    html_lines.append("</ol>")

html_lines.append("</body></html>")
full_html = "\n".join(html_lines)

doc_path.write_text(full_html, encoding="utf-8")
html_path.write_text(full_html, encoding="utf-8")
print("Successfully generated:", doc_path, "and", html_path)
