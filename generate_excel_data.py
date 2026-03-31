import xlsxwriter
from datetime import datetime

# Provided Data
premium_data = [
    (2015,367378,84),
    (2016,104582,125),
    (2017,497650,51),
    (2018,321482,129),
    (2019,364931,75),
    (2020,314643,151),
    (2021,484462,138),
    (2022,365106,108),
    (2023,208127,53),
    (2024,453117,200)
]

rate_changes = [
    ("2018-01-01", 0.025),
    ("2019-01-01", 0.030),
    ("2020-01-01", -0.015),
    ("2021-01-01", 0.040),
    ("2022-01-01", 0.050),
    ("2023-01-01", 0.035),
    ("2024-01-01", 0.020),
    ("2025-01-01", 0.015)
]

eval_date = "2025-12-31"

workbook = xlsxwriter.Workbook('Actuarial_Model_Data_Interactive.xlsx')
bold = workbook.add_format({'bold': True})
pct_format = workbook.add_format({'num_format': '0.00%'})
currency = workbook.add_format({'num_format': '$#,##0'})
num_format = workbook.add_format({'num_format': '0.0000'})
date_format = workbook.add_format({'num_format': 'yyyy-mm-dd'})
header = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'border': 1})
highlight = workbook.add_format({'bg_color': '#FFFFE0', 'num_format': '0.0000'})
highlight_c = workbook.add_format({'bg_color': '#E8F5E9', 'num_format': '$#,##0'})
toggle_format = workbook.add_format({'bold': True, 'bg_color': '#FFDDC1', 'border': 1})

# --- Sheet 1: Rate History ---
ws_rate = workbook.add_worksheet("Rate History")
ws_rate.set_column('A:A', 15)
ws_rate.set_column('B:D', 18)
ws_rate.write_row(0, 0, ["Date", "Rate Change", "Cumulative Level"], header)

row = 1
ws_rate.write_datetime(row, 0, datetime(1900, 1, 1), date_format)
ws_rate.write(row, 1, 0, pct_format)
ws_rate.write(row, 2, 1.0, num_format)

for d, p in rate_changes:
    row += 1
    dt = datetime.strptime(d, "%Y-%m-%d")
    ws_rate.write_datetime(row, 0, dt, date_format)
    ws_rate.write(row, 1, p, pct_format)
    ws_rate.write_formula(row, 2, f"=C{row} * (1 + B{row+1})", num_format)

rate_table_range = f"'Rate History'!$A$2:$C${row+1}"
eval_row = row + 2

ws_rate.write(eval_row, 0, "Evaluation Date:", bold)
ws_rate.write_datetime(eval_row, 1, datetime.strptime(eval_date, "%Y-%m-%d"), date_format)
ws_rate.write(eval_row + 1, 0, "Current Level:", bold)
ws_rate.write_formula(eval_row + 1, 2, f"=VLOOKUP(B{eval_row+1}, {rate_table_range}, 3, TRUE)", highlight)
current_level_ref = f"'Rate History'!$C${eval_row+2}"


# --- Sheet 2: Written Premium (WP) ---
ws_wp = workbook.add_worksheet("WP Onleveling")
ws_wp.set_column('A:G', 18)
ws_wp.write_row(0, 0, ["Year", "Written Premium ($)", "Mid-Year Target Date", "Historic Auth Level", "Factor (Current/Hist)", "OnLevel Premium"], header)

row = 1
for y, prm, exp in premium_data:
    ws_wp.write(row, 0, y)
    ws_wp.write(row, 1, prm, currency)
    ws_wp.write_formula(row, 2, f"=DATE(A{row+1}, 7, 1)", date_format)
    ws_wp.write_formula(row, 3, f"=VLOOKUP(C{row+1}, {rate_table_range}, 3, TRUE)", num_format)
    ws_wp.write_formula(row, 4, f"={current_level_ref} / D{row+1}", highlight)
    ws_wp.write_formula(row, 5, f"=B{row+1} * E{row+1}", highlight_c)
    row += 1


# --- Sheet 3: Calendar Year (CY) Continuous Exact ---
ws_cy = workbook.add_worksheet("CY Continuous Exact")
ws_cy.set_column('A:F', 18)

# We define the day grid: -365 to +365 representing e_days index.
DAY_COL_START = 6  # col G (index 6)
ws_cy.write(1, DAY_COL_START - 1, "e_days offset ->", bold)

for e_days in range(-365, 366):
    col = DAY_COL_START + (e_days + 365)
    ws_cy.write(1, col, e_days)

cols = ["Year", "Earned Premium ($)", "CY Factor", "On-Level Premium", "CY Average Rate Level"]
ws_cy.write_row(2, 0, cols, header)

row = 3
for y, prm, exp in premium_data:
    ws_cy.write(row, 0, y)
    ws_cy.write(row, 1, prm, currency)
    
    start_col_name = xlsxwriter.utility.xl_col_to_name(DAY_COL_START)
    end_col_name = xlsxwriter.utility.xl_col_to_name(DAY_COL_START + 730)
    
    # We will write the daily calculation in each grid cell: level * area_weight
    for e_days in range(-365, 366):
        c = DAY_COL_START + (e_days + 365)
        c_name = xlsxwriter.utility.xl_col_to_name(c)
        
        formula = f'=(MAX(0, 365-ABS({c_name}$2))/(365*365)) * VLOOKUP(DATE($A{row+1}, 1, 1) + {c_name}$2, {rate_table_range}, 3, TRUE)'
        ws_cy.write_formula(row, c, formula, num_format)
        
    avg_formula = f'=SUM({start_col_name}{row+1}:{end_col_name}{row+1})'
    ws_cy.write_formula(row, 4, avg_formula, num_format)
    
    ws_cy.write_formula(row, 2, f'={current_level_ref} / E{row+1}', highlight)
    ws_cy.write_formula(row, 3, f'=B{row+1} * D{row+1}', highlight_c)
    
    row += 1

# Hide the massive calculation grid explicitly so the frontend UI is instantly readable
ws_cy.set_column(DAY_COL_START, DAY_COL_START + 730, 8, None, {'hidden': 1, 'level': 1})


# --- Sheet 4: Policy Year (PY) EP ---
ws_py = workbook.add_worksheet("PY EP Onleveling")
ws_py.set_column('A:AD', 15)

cols = ["Year", "Earned Premium ($)"] + [f"M{m} Lvl" for m in range(1,25)] + ["Wt. Triangle Avg Level", "PY Factor", "PY OnLevel Premium"]
ws_py.write_row(2, 0, cols, header)

ws_py.write(3, 0, "Triangular Weights ->", bold)
for m in range(1, 25):
    w = m / 144.0 if m <= 12 else (25 - m) / 144.0
    ws_py.write(3, m+1, w, num_format)

row = 4
for y, prm, exp in premium_data:
    ws_py.write(row, 0, y)
    ws_py.write(row, 1, prm, currency)
    
    col = 2
    for m in range(1, 25):
        date_expr = f"DATE($A{row+1} + INT(({m}-1)/12), MOD({m}-1,12)+1, 15)"
        eff_date_expr = f"EDATE({date_expr}, -6)"
        vlookup_formula = f"=VLOOKUP({eff_date_expr}, {rate_table_range}, 3, TRUE)"
        ws_py.write_formula(row, col, vlookup_formula, num_format)
        col += 1
        
    start_col = xlsxwriter.utility.xl_col_to_name(2)
    end_col = xlsxwriter.utility.xl_col_to_name(col-1)
    ws_py.write_formula(row, col, f"=SUMPRODUCT({start_col}$4:{end_col}$4, {start_col}{row+1}:{end_col}{row+1})", num_format)
    col += 1
    
    avg_lvl_cell = f"{xlsxwriter.utility.xl_col_to_name(col-1)}{row+1}"
    ws_py.write_formula(row, col, f"={current_level_ref} / {avg_lvl_cell}", highlight)
    col += 1
    
    factor_cell = f"{xlsxwriter.utility.xl_col_to_name(col-1)}{row+1}"
    ws_py.write_formula(row, col, f"=$B{row+1} * {factor_cell}", highlight_c)
    
    row += 1

workbook.close()
