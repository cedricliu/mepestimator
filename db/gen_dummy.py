"""Generate db/04_dummy_data.sql with realistic test data."""
import random

random.seed(42)


def price(base, pct=0.20):
    v = base * (1 + random.uniform(-pct, pct))
    return int(round(v / 50) * 50) or 50


vendors = [
    ("VENDOR-ELEC-A", "聯合電氣工程",    "{ELEC}"),
    ("VENDOR-HVAC-A", "台灣冷暖工程",    "{HVAC}"),
    ("VENDOR-PLUMB-A","全盛水電工程",    "{PLUMB}"),
    ("VENDOR-FIRE-A", "安全消防設備",    "{FIRE}"),
    ("VENDOR-WEAK-A", "智慧系統整合",    "{WEAK}"),
    ("VENDOR-MEP-A",  "綜合機電工程",    "{ELEC,HVAC,PLUMB,FIRE,WEAK}"),
    ("VENDOR-ELEC-B", "宏達電機工程",    "{ELEC}"),
    ("VENDOR-HVAC-B", "冷暖空調設備",    "{HVAC}"),
    ("VENDOR-PLUMB-B","新世紀給排水",    "{PLUMB,FIRE}"),
]

projects = [
    ("WH-2024-001", "新竹林口倉儲廠房",    "WAREHOUSE",    8500, "2024-03-15", "新竹"),
    ("OF-2024-002", "台北信義辦公大樓",    "OFFICE",      12000, "2024-05-20", "台北"),
    ("HP-2023-003", "桃園醫療中心新建工程", "HOSPITAL",    25000, "2023-11-10", "桃園"),
    ("FC-2025-001", "台中精密零件工廠",    "FACTORY",     15000, "2025-01-08", "台中"),
    ("RS-2024-004", "新北住宅社區大樓",    "RESIDENTIAL",  9200, "2024-08-30", "新北"),
    ("DC-2024-005", "台南資料中心",        "DATACENTER",   3800, "2024-07-12", "台南"),
]

# (item_code, description, uom, base_price, qty_per_1000m2)
ITEMS = {
    "ELEC": [
        ("E-001", "主配電盤 3P 1600A ACB",        "式", 380000, 0.08),
        ("E-002", "主配電盤 3P 630A MCB",         "式", 185000, 0.12),
        ("E-003", "分配電盤 3P 100A",             "台",  32000, 1.20),
        ("E-004", "PVC 電線管 25mm",              "m",      85,  240),
        ("E-005", "電纜橋架 300mm W 鍍鋅",        "m",     420,   85),
        ("E-006", "電力電纜 4C 16mm2 XLPE",       "m",     310,  120),
        ("E-007", "電力電纜 3C 6mm2 PVC",         "m",     185,   90),
        ("E-008", "LED 高天棚燈 150W",            "台",   4800,   14),
        ("E-009", "LED 崁燈 18W",                 "台",   1200,   28),
        ("E-010", "緊急出口照明燈 2W",            "台",   1850,    4),
        ("E-011", "不斷電系統 UPS 20KVA",         "台",  95000, 0.08),
        ("E-012", "接地系統 (接地棒+匯流排)",      "式",  28000, 0.10),
    ],
    "HVAC": [
        ("H-001", "氣冷式冰水主機 200RT",          "台", 1850000, 0.04),
        ("H-002", "屋頂型箱型冷氣 20RT",          "台",  285000, 0.06),
        ("H-003", "分離式冷氣 5HP 變頻",          "台",   58000, 2.40),
        ("H-004", "全熱交換器 1000CMH",           "台",   45000, 0.80),
        ("H-005", "排風機 2000CMH",               "台",   12500, 1.20),
        ("H-006", "鍍鋅風管 400x300mm",           "m",      850,   62),
        ("H-007", "軟性接管 250mm dia",           "m",      320,   18),
        ("H-008", "出風口 600x300mm 鋁合金",      "個",    1800,   10),
        ("H-009", "風管保溫 25mm 玻璃棉",         "m²",     380,   62),
        ("H-010", "冷媒銅管 3/8 + 5/8",          "m",      420,  240),
    ],
    "PLUMB": [
        ("P-001", "給水管 PPR PN20 25mm",         "m",      145,   38),
        ("P-002", "給水管 PPR PN20 50mm",         "m",      285,   18),
        ("P-003", "排水管 PVC 100mm dia",         "m",      195,   42),
        ("P-004", "污水管 PVC 150mm dia",         "m",      320,   20),
        ("P-005", "玻璃鋼水箱 10T",               "台",   98000, 0.10),
        ("P-006", "加壓泵組 3HP",                 "組",   75000, 0.12),
        ("P-007", "地板洩水孔 150x150mm",         "個",     850,  4.8),
        ("P-008", "衛生設備 (馬桶+洗手台+鏡)",    "套",   18500, 2.40),
        ("P-009", "熱水器 30L 電熱",              "台",   12000, 0.40),
        ("P-010", "不銹鋼水管 2\" 白鐵",           "m",      480,   12),
    ],
    "FIRE": [
        ("F-001", "撒水頭 直立型 68°C",           "個",     380,   32),
        ("F-002", "撒水頭 吊式型 68°C",           "個",     420,   28),
        ("F-003", "消防配管 SCH40 50mm",          "m",      480,   58),
        ("F-004", "消防配管 SCH40 25mm",          "m",      280,   45),
        ("F-005", "消防箱 25mm 含水帶",           "組",    8500,  1.2),
        ("F-006", "偵煙探測器 光電式",            "個",    1200,   12),
        ("F-007", "手動報警器",                   "個",     850,    4),
        ("F-008", "火警受信總機 20回路",           "式",   65000, 0.10),
        ("F-009", "滅火器 10P 乾粉",              "個",    1500,  3.2),
        ("F-010", "緊急廣播系統",                 "式",   85000, 0.08),
    ],
    "WEAK": [
        ("W-001", "IP 攝影機 2MP 半球型",         "台",    3800,  2.4),
        ("W-002", "IP 攝影機 4MP 槍型",           "台",    5200,  1.6),
        ("W-003", "NVR 16CH 4K H.265",           "台",   28000, 0.20),
        ("W-004", "門禁系統 感應卡讀卡機",         "式",    9500,  0.6),
        ("W-005", "CAT6 UTP 網路線",              "m",       38,  150),
        ("W-006", "網路交換器 24port GbE",        "台",   15000, 0.40),
        ("W-007", "廣播音響系統 (擴大機+喇叭)",    "式",   45000, 0.10),
        ("W-008", "室內對講主機",                 "式",   12000, 0.20),
        ("W-009", "光纖主幹線 12C SM",            "m",      185,   10),
        ("W-010", "資訊插座 CAT6 雙孔",           "個",     680,  8.0),
    ],
}

DISC_VENDORS = {
    "ELEC":  ["VENDOR-ELEC-A", "VENDOR-ELEC-B", "VENDOR-MEP-A"],
    "HVAC":  ["VENDOR-HVAC-A", "VENDOR-HVAC-B", "VENDOR-MEP-A"],
    "PLUMB": ["VENDOR-PLUMB-A", "VENDOR-PLUMB-B", "VENDOR-MEP-A"],
    "FIRE":  ["VENDOR-FIRE-A", "VENDOR-PLUMB-B", "VENDOR-MEP-A"],
    "WEAK":  ["VENDOR-WEAK-A", "VENDOR-MEP-A"],
}

out = []

out.append("-- ============================================================")
out.append("-- MEP Ops — Dummy data for user testing")
out.append("-- db/04_dummy_data.sql")
out.append("-- ============================================================")
out.append("")

# vendors
out.append("\\echo '>>> Inserting vendors...'")
for vc, vn, dc in vendors:
    out.append(
        f"INSERT INTO proc.vendors (vendor_code, vendor_name, discipline_codes)"
        f" VALUES ('{vc}', '{vn}', '{dc}'::text[])"
        f" ON CONFLICT (vendor_code) DO UPDATE"
        f" SET vendor_name=EXCLUDED.vendor_name, discipline_codes=EXCLUDED.discipline_codes;"
    )
out.append("")

# projects
out.append("\\echo '>>> Inserting projects...'")
for pc, pn, pt, gfa, bd, region in projects:
    out.append(
        f"INSERT INTO proc.projects (project_code, project_name, project_type_code, gfa_m2, bid_date, region)"
        f" VALUES ('{pc}', '{pn}', '{pt}', {gfa}, '{bd}', '{region}')"
        f" ON CONFLICT (project_code) DO NOTHING;"
    )
out.append("")

# quote lines via VALUES + JOIN
out.append("\\echo '>>> Inserting quote lines...'")
out.append("INSERT INTO proc.quote_lines")
out.append("  (project_id, vendor_id, discipline, item_code, description,")
out.append("   uom, qty, unit_price, currency, confidence, import_batch)")
out.append("SELECT")
out.append("  p.project_id, v.vendor_id, q.discipline, q.item_code, q.description,")
out.append("  q.uom, q.qty::numeric, q.unit_price::numeric, 'TWD',")
out.append("  q.confidence::numeric, 'dummy_data_v1'")
out.append("FROM (VALUES")

rows = []
for proj_code, _, _, gfa, _, _ in projects:
    for disc, items in ITEMS.items():
        # One vendor per discipline per project (rotates so different projects
        # use different vendors → price variation in mv_price_stats)
        pool = DISC_VENDORS[disc]
        vc = pool[projects.index(
            next(p for p in projects if p[0] == proj_code)
        ) % len(pool)]
        for item_code, desc, uom, base_p, qty_per_k in items:
            qty = round(gfa / 1000 * qty_per_k, 1)
            if qty < 0.1:
                qty = 1
            up = price(base_p)
            conf = round(random.uniform(0.75, 1.0), 2)
            rows.append(
                f"  ('{proj_code}','{vc}','{disc}','{item_code}',"
                f"'{desc}','{uom}',{qty},{up},{conf})"
            )

out.append(",\n".join(rows))
out.append(") AS q(project_code,vendor_code,discipline,item_code,description,uom,qty,unit_price,confidence)")
out.append("JOIN proc.projects p ON p.project_code = q.project_code")
out.append("JOIN proc.vendors  v ON v.vendor_code  = q.vendor_code")
out.append("ON CONFLICT (project_id, discipline, item_code, description) DO UPDATE SET")
out.append("  unit_price   = EXCLUDED.unit_price,")
out.append("  qty          = EXCLUDED.qty,")
out.append("  vendor_id    = EXCLUDED.vendor_id,")
out.append("  import_batch = EXCLUDED.import_batch;")
out.append("")
out.append("\\echo '>>> Refreshing materialized view...'")
out.append("REFRESH MATERIALIZED VIEW proc.mv_price_stats;")
out.append("")
out.append("\\echo '>>> Dummy data loaded successfully.'")
out.append("-- END OF FILE")

sql = "\n".join(out)
with open("C:/Users/cedric.liu/mep_db/db/04_dummy_data.sql", "w", encoding="utf-8") as f:
    f.write(sql)

print(f"Generated {len(rows)} quote line rows across {len(projects)} projects, {len(vendors)} vendors.")
