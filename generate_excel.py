import xlsxwriter
from datetime import datetime

# Initialize Workbook
workbook = xlsxwriter.Workbook('Onleveling_Demonstration.xlsx')
bold = workbook.add_format({'bold': True})
pct_format = workbook.add_format({'num_format': '0.00%'})
currency = workbook.add_format({'num_format': '$#,##0.00'})
num_format = workbook.add_format({'num_format': '0.0000'})
header = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'border': 1})

# --- Sheet 1: Rate History & Current Level ---
ws_rate = workbook.add_worksheet("1. Rate History")
ws_rate.set_column('A:B', 15)
ws_rate.set_column('C:E', 20)

ws_rate.write('A1', 'Date', header)
ws_rate.write('B1', 'Rate Change (%)', header)
ws_rate.write('C1', 'Cumulative Level', header)
ws_rate.write('D1', 'Evaluation Date', header)

# Data
rate_changes = [
    ("2020-07-01", 0.05),
    ("2021-01-01", 0.10),
    ("2022-04-01", -0.02)
]
row = 1
ws_rate.write(row, 0, "Base")
ws_rate.write(row, 1, 0, pct_format)
ws_rate.write(row, 2, 1.0, num_format)
ws_rate.write(row, 3, "2022-12-31")

for date, pct in rate_changes:
    row += 1
    ws_rate.write(row, 0, date)
    ws_rate.write(row, 1, pct, pct_format)
    # Formula for Cumulative = Previous Cumulative * (1 + pct)
    ws_rate.write_formula(row, 2, f'=C{row}*(1+B{row+1})', num_format)

ws_rate.write(row + 2, 0, "Current Level (Eval Date):", bold)
ws_rate.write_formula(row + 2, 2, f'=C{row+1}', num_format)


# --- Sheet 2: WRITTEN PREMIUM (WP) Math ---
ws_wp = workbook.add_worksheet("2. WP Example")
ws_wp.set_column('A:F', 18)

ws_wp.write('A1', 'Policy Year', header)
ws_wp.write('B1', 'Effective Date Assumed', header)
ws_wp.write('C1', 'Rate Level at Eff Date', header)
ws_wp.write('D1', 'Current Level', header)
ws_wp.write('E1', 'WP Factor (Current/Old)', header)

ws_wp.write('A2', 2020)
ws_wp.write('B2', '2020-07-01 (Mid-Year)')
ws_wp.write('C2', 1.05, num_format)
ws_wp.write_formula('D2', "='1. Rate History'!C5")
ws_wp.write_formula('E2', '=D2/C2', num_format)


# --- Sheet 3: CALENDAR YEAR (CY) EP Math ---
ws_cy = workbook.add_worksheet("3. CY EP Example (2020)")
ws_cy.set_column('A:G', 18)

ws_cy.write('A1', 'Month', header)
ws_cy.write('B1', 'Earned Fraction (Weight)', header)
ws_cy.write('C1', 'Month Target Date', header)
ws_cy.write('D1', 'Policies Written On:', header)
ws_cy.write('E1', 'Rate Level for Policies', header)

row = 1
# Demonstrating standard 12 month CY mechanics
for m in range(1, 13):
    ws_cy.write(row, 0, f'2020-{m:02d}')
    ws_cy.write(row, 1, 1/12, num_format)
    ws_cy.write(row, 2, f'2020-{m:02d}-15')
    ws_cy.write(row, 3, f'Trailers back 12M')
    # Mocking level for demonstration
    level = 1.0 if m < 7 else 1.05
    ws_cy.write(row, 4, level, num_format)
    row += 1

ws_cy.write(row + 1, 0, "Average Earned Level:", bold)
ws_cy.write_formula(row + 1, 4, "=SUMPRODUCT(B2:B13, E2:E13)", num_format)
ws_cy.write(row + 2, 0, "CY Factor (Current / Avg):", bold)
ws_cy.write_formula(row + 2, 4, "='1. Rate History'!C5 / E15", num_format)


# --- Sheet 4: POLICY YEAR (PY) EP Math ---
ws_py = workbook.add_worksheet("4. PY EP Example (2020)")
ws_py.set_column('A:F', 18)

ws_py.write('A1', 'Month (1-24)', header)
ws_py.write('B1', 'Target Date', header)
ws_py.write('C1', 'Level on Date', header)
ws_py.write('D1', 'Triangular Weight', header)

row = 1
for m in range(1, 25):
    # Year logic
    yr = 2020 if m <= 12 else 2021
    mn = m if m <= 12 else m - 12
    ws_py.write(row, 0, f'Month {m}')
    ws_py.write(row, 1, f'{yr}-{mn:02d}-15')
    
    # Weight
    weight = m / 144 if m <= 12 else (25 - m) / 144
    ws_py.write(row, 3, weight, num_format)
    
    # Mock Level
    level = 1.0
    if m >= 7 and m < 13: level = 1.05
    elif m >= 13: level = 1.155
    ws_py.write(row, 2, level, num_format)
    
    row += 1

ws_py.write(row + 1, 0, "Average Earned Level:", bold)
ws_py.write_formula(row + 1, 2, "=SUMPRODUCT(C2:C25, D2:D25)", num_format)
ws_py.write(row + 2, 0, "PY Factor (Current / Avg):", bold)
ws_py.write_formula(row + 2, 2, "='1. Rate History'!C5 / C27", num_format)

workbook.close()
