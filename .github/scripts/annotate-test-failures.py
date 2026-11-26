"""Turns failed JUnit results (surefire/failsafe XML) into GitHub error annotations, so the failing test and its
message are visible on the run page and through the public API without downloading artifacts."""
import glob
import xml.etree.ElementTree as ET

count = 0
for path in glob.glob("**/target/*-reports/TEST-*.xml", recursive=True):
    root = ET.parse(path).getroot()
    for case in root.iter("testcase"):
        for kind in ("failure", "error"):
            node = case.find(kind)
            if node is None:
                continue
            message = node.get("message") or ((node.text or "").strip().splitlines() or [""])[0]
            message = " ".join(message.split())[:400].replace("%", "%25")
            module = path.split("/target/")[0]
            print(f"::error title={kind} in {module}::{case.get('classname')}.{case.get('name')}: {message}")
            count += 1
            if count >= 40:
                raise SystemExit(0)
print(f"{count} failing test(s) annotated")
