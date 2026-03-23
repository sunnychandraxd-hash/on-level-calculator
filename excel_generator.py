import xlsxwriter
import math
from datetime import date, timedelta

workbook = xlsxwriter.Workbook('Exact_OnLevel_Logic.xlsx')

# Formats
fmt_pct = workbook.add_format({'num_format': '0.00%'})
fmt_date = workbook.add_format({'num_format': 'yyyy-mm-dd'})
fmt_factor = workbook.add_format({'num_format': '0.000000'})
fmt_bold = workbook.add_format({'bold': True})
fmt_bg = workbook.add_format({'bg_color': '#D3D3D3', 'bold': True})
fmt_wrap = workbook.add_format({'text_wrap': True})

# 1. Rate Changes Sheet
ws_rc = workbook.add_worksheet('1_Rate_Changes')
ws_rc.write_row('A1', ['Effective Date', 'Rate Change %', 'Cumulative Level'], fmt_bg)

rc_data = [
    (date(2022, 1, 1), 0.0),
    (date(2023, 1, 1), 0.05),
    (date(2024, 7, 1), 0.10)
]
for i, (d, pct) in enumerate(rc_data):
    row = i + 1
    ws_rc.write_datetime(row, 0, d, fmt_date)
    val = pct if i > 0 else 0
    ws_rc.write_number(row, 1, val, fmt_pct)
    if row == 1:
        ws_rc.write_number(row, 2, 1.0, fmt_factor)
    else:
        ws_rc.write_formula(row, 2, f'=C{row}*(1+B{row+1})', fmt_factor)

# Helper macro equivalent using VLOOKUP for a specific date cell
def get_level_formula(date_cell):
    return f'VLOOKUP({date_cell}, \'1_Rate_Changes\'!$A$2:$C$100, 3, TRUE)'

ws_rc.set_column('A:A', 15)
ws_rc.set_column('B:C', 18)


# 2. Policy-Level Engine
ws_eng = workbook.add_worksheet('2_Policy_Level (engine)')
ws_eng.write_row('A1', ['Input', 'Value'], fmt_bg)
ws_eng.write('A2', 'Historical Premium', fmt_bold)
ws_eng.write_number('B2', 1000)
ws_eng.write('A3', 'Policy Effective Date', fmt_bold)
ws_eng.write_datetime('B3', date(2023, 5, 1), fmt_date)
ws_eng.write('A4', 'Evaluation Date', fmt_bold)
ws_eng.write_datetime('B4', date(2025, 1, 1), fmt_date)
ws_eng.write('A5', 'Policy Term (months)', fmt_bold)
ws_eng.write_number('B5', 12)

ws_eng.write('A7', 'Written Factor Logic', fmt_bg)
ws_eng.write('B7', '', fmt_bg)
ws_eng.write('A8', 'Current Level', fmt_bold)
ws_eng.write_formula('B8', get_level_formula('B4'), fmt_factor)
ws_eng.write('A9', 'Historical Level', fmt_bold)
ws_eng.write_formula('B9', get_level_formula('B3'), fmt_factor)
ws_eng.write('A10', 'Written Factor (Cur/Hist)', fmt_bold)
ws_eng.write_formula('B10', '=B8/B9', fmt_factor)


ws_eng.write('A12', 'Earned Factor Logic', fmt_bg)
ws_eng.write('B12', '', fmt_bg)
ws_eng.write('A13', 'Assuming N periods (term_months)')
ws_eng.write_row('A14', ['Period', 'Mid-Date Formula (Info)', 'Mid-Date (Eval)', 'Rate Level', 'Weight'], fmt_bg)

for i in range(12):
    row = i + 14
    period = i + 1
    ws_eng.write_number(row, 0, period)
    # formula for date: PolicyDate + ((Period-0.5)/12) * TermDays
    ws_eng.write_string(row, 1, f'=INT($B$3 + (({period}-0.5)/$B$5)*($B$5*30.4375))')
    ws_eng.write_formula(row, 2, f'=INT($B$3 + (({period}-0.5)/$B$5)*($B$5*30.4375))', fmt_date)
    ws_eng.write_formula(row, 3, get_level_formula(f'C{row+1}'), fmt_factor)
    ws_eng.write_number(row, 4, 1.0/12, fmt_factor)

sum_row = 14 + 12
ws_eng.write(sum_row, 2, 'Weighted Hist Level:', fmt_bold)
ws_eng.write_formula(sum_row, 3, f'=SUMPRODUCT(D15:D{sum_row}, E15:E{sum_row})', fmt_factor)

factor_row = sum_row + 1
ws_eng.write(factor_row, 2, 'Earned Factor (Cur/W.Hist):', fmt_bold)
ws_eng.write_formula(factor_row, 3, f'=$B$8/D{sum_row+1}', fmt_factor)

ws_eng.set_column('A:E', 25)

# 3. Aggregated Parallelogram
ws_para = workbook.add_worksheet('3_Aggregated (parallel)')
ws_para.write_row('A1', ['Input', 'Value'], fmt_bg)
ws_para.write('A2', 'Evaluation Date', fmt_bold)
ws_para.write_datetime('B2', date(2025, 1, 1), fmt_date)
ws_para.write('A3', 'Calendar/Policy Year', fmt_bold)
ws_para.write_number('B3', 2023)
ws_para.write('A4', 'Policy Term (months)', fmt_bold)
ws_para.write_number('B4', 12)
ws_para.write('A5', 'Current Rate Level', fmt_bold)
ws_para.write_formula('B5', get_level_formula('B2'), fmt_factor)

ws_para.write('A7', 'WP Factor Logic', fmt_bg)
ws_para.write('B7', '', fmt_bg)
ws_para.write('A8', 'Avg Eff Date (July 1st)', fmt_bold)
ws_para.write_formula('B8', '=DATE(B3, 7, 1)', fmt_date)
ws_para.write('A9', 'Rate Level', fmt_bold)
ws_para.write_formula('B9', get_level_formula('B8'), fmt_factor)
ws_para.write('A10', 'WP Factor', fmt_bold)
ws_para.write_formula('B10', '=B5/B9', fmt_factor)

ws_para.write('A12', 'PY EP Factor Logic', fmt_bg)
ws_para.write('B12', '', fmt_bg)
ws_para.write_row('A13', ['Month (m)', 'Calc Midpoint', 'Eff Date (-term/2)', 'Rate Level', 'Weight(w)'], fmt_bg)

for m in range(1, 25): 
    row = m + 12
    ws_para.write_number(row, 0, m)
    # calc midpoint
    ws_para.write_formula(row, 1, f'=DATE($B$3 + INT(({m}-1)/12), MOD({m}-1, 12) + 1, 15)', fmt_date)
    # eff date
    ws_para.write_formula(row, 2, f'=EDATE(B{row+1}, -(INT($B$4/2)))', fmt_date)
    # rate level
    ws_para.write_formula(row, 3, get_level_formula(f'C{row+1}'), fmt_factor)
    # weight
    ws_para.write_formula(row, 4, f'=IF({m}<=$B$4, {m}, (2*$B$4)-{m}+1)')

sum_py_row = 13 + 24
ws_para.write(sum_py_row, 2, 'Totals:', fmt_bold)
ws_para.write_formula(sum_py_row, 3, f'=SUMPRODUCT(D14:D{sum_py_row}, E14:E{sum_py_row})', fmt_factor)
ws_para.write_formula(sum_py_row, 4, f'=SUM(E14:E{sum_py_row})')
ws_para.write(sum_py_row+1, 2, 'Avg Level:', fmt_bold)
ws_para.write_formula(sum_py_row+1, 3, f'=D{sum_py_row+1}/E{sum_py_row+1}', fmt_factor)
ws_para.write(sum_py_row+2, 2, 'PY Factor:', fmt_bold)
ws_para.write_formula(sum_py_row+2, 3, f'=$B$5/D{sum_py_row+2}', fmt_factor)

# CY Logic - 50x50 Geometric Integration
ws_para.write('G1', 'CY EP Factor - 50x50 Integration (parallelogram.py)', fmt_bg)
ws_para.write_row('G2', ['Point i', 'Point j', 't_date (t)', 'eff_date', 'Rate Level'], fmt_bg)

current_row = 2
for i in range(50):
    for j in range(50):
        ws_para.write_number(current_row, 6, i)
        ws_para.write_number(current_row, 7, j)
        # t_date
        ws_para.write_formula(current_row, 8, f'=INT(DATE($B$3,1,1) + ({i}+0.5)*365/50)', fmt_date)
        # eff_date
        ws_para.write_formula(current_row, 9, f'=I{current_row+1} - INT(ROUND($B$4 * 30.4375, 0) * ({j}+0.5)/50)', fmt_date)
        # level
        ws_para.write_formula(current_row, 10, get_level_formula(f'J{current_row+1}'), fmt_factor)
        current_row += 1

ws_para.write(current_row, 9, 'CY Avg Level:', fmt_bold)
ws_para.write_formula(current_row, 10, f'=AVERAGE(K3:K{current_row})', fmt_factor)
ws_para.write(current_row+1, 9, 'CY Factor:', fmt_bold)
ws_para.write_formula(current_row+1, 10, f'=$B$5/K{current_row+1}', fmt_factor)

ws_para.set_column('A:F', 20)
ws_para.set_column('G:K', 20)

workbook.close()
print("Excel file 'Exact_OnLevel_Logic.xlsx' generated successfully.")
