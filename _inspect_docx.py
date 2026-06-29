from docx import Document

path = r"D:\SEMESTER 8\WDP\Parking Building Management System.docx"
doc = Document(path)

keywords = ["7 day", "7-day", "next 7", "+2", "+3", "Tomorrow",
            "30", "05:30", "beyond", "rolling", "reservationTimeoutMinutes",
            "within the next", "arrival date", "short-term", "2 hour"]

for i, p in enumerate(doc.paragraphs):
    t = p.text
    if any(k.lower() in t.lower() for k in keywords):
        print(f"[{i}] runs={len(p.runs)} | {t!r}")
