import xlsxwriter
from datetime import datetime

def generate_textbook_rater():
    workbook = xlsxwriter.Workbook('Textbook_Method_Rater.xlsx')
    
    # --- Formatting ---
    fmt_header = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'border': 1, 'align': 'center'})
    fmt_date = workbook.add_format({'num_format': 'yyyy-mm-dd', 'align': 'center', 'border': 1})
    fmt_pct = workbook.add_format({'num_format': '0.00%', 'align': 'center', 'border': 1})
    fmt_factor = workbook.add_format({'num_format': '0.0000', 'align': 'center', 'border': 1})
    fmt_curr = workbook.add_format({'num_format': '$#,##0', 'align': 'center', 'border': 1})
    fmt_bold = workbook.add_format({'bold': True, 'border': 1, 'align': 'center'})
    fmt_hilite = workbook.add_format({'bg_color': '#FFFFE0', 'num_format': '0.0000', 'border': 1, 'align': 'center'})
    fmt_hilite_c = workbook.add_format({'bg_color': '#E8F5E9', 'num_format': '$#,##0', 'border': 1, 'align': 'center'})
    
    # --- 1. Inputs & Rate History ---
    ws_inputs = workbook.add_worksheet("1. Rate History")
    ws_inputs.set_column('A:B', 18)
    ws_inputs.set_column('C:E', 25)
    
    ws_inputs.write_row('A1', ["Rate Change Date", "Rate Change %", "Cumulative Rate Level", "Incremental Diff (\u0394L)"], fmt_header)
    
    # Pre-fill some standard data
    rate_changes = [
        ("2015-01-01", 0.00), # Base
        ("2018-04-01", 0.05),
        ("2019-10-01", -0.02),
        ("2021-07-01", 0.08),
        ("2023-01-01", 0.04),
        ("2024-05-15", 0.03)
    ]
    
    ws_inputs.write_datetime(1, 0, datetime.strptime(rate_changes[0][0], "%Y-%m-%d"), fmt_date)
    ws_inputs.write_number(1, 1, rate_changes[0][1], fmt_pct)
    ws_inputs.write_number(1, 2, 1.0, fmt_factor)
    ws_inputs.write_number(1, 3, 1.0, fmt_factor)
    
    max_rc_rows = 20
    for i in range(1, max_rc_rows):
        row = i + 1
        if i < len(rate_changes):
            ws_inputs.write_datetime(row, 0, datetime.strptime(rate_changes[i][0], "%Y-%m-%d"), fmt_date)
            ws_inputs.write_number(row, 1, rate_changes[i][1], fmt_pct)
        else:
            # Blank rows for user to add more
            ws_inputs.write_blank(row, 0, None, fmt_date)
            ws_inputs.write_blank(row, 1, None, fmt_pct)
            
        # Formula for Cumulative Level: IF(A3="","",C2*(1+B3))
        ws_inputs.write_formula(row, 2, f'=IF(A{row+1}="","", C{row}*(1+B{row+1}))', fmt_factor)
        # Formula for Incremental Diff: IF(A3="","",C3-C2)
        ws_inputs.write_formula(row, 3, f'=IF(A{row+1}="","", C{row+1}-C{row})', fmt_factor)
        
    eval_row = max_rc_rows + 2
    ws_inputs.write(eval_row, 0, "Evaluation Date:", fmt_bold)
    ws_inputs.write_datetime(eval_row, 1, datetime.strptime("2025-12-31", "%Y-%m-%d"), fmt_date)
    ws_inputs.write(eval_row + 1, 0, "Current Level:", fmt_bold)
    # Get the max cumulative level before or on eval date
    ws_inputs.write_formula(eval_row + 1, 1, f'=VLOOKUP(B{eval_row+1}, A2:C{max_rc_rows+1}, 3, TRUE)', fmt_hilite)
    
    current_level_ref = f"'1. Rate History'!$B${eval_row+2}"
    rc_date_col = f"'1. Rate History'!$A$2:$A${max_rc_rows+1}"
    rc_diff_col = f"'1. Rate History'!$D$2:$D${max_rc_rows+1}"
    
    # --- 2. CY Exact Textbook Method ---
    ws_cy = workbook.add_worksheet("2. CY Exact Textbook Method")
    ws_cy.set_column('A:A', 12)
    ws_cy.set_column('B:C', 20)
    ws_cy.set_column('D:F', 25)
    
    ws_cy.write_row('A1', ["CY", "Earned Premium", "Exact Avg Rate Level", "CY On-Level Factor", "On-Level Premium"], fmt_header)
    
    premium_data = [
        (2018, 500000), (2019, 520000), (2020, 540000),
        (2021, 560000), (2022, 580000), (2023, 600000),
        (2024, 620000), (2025, 640000)
    ]
    
    for i, (yr, prem) in enumerate(premium_data):
        row = i + 1
        ws_cy.write_number(row, 0, yr, fmt_bold)
        ws_cy.write_number(row, 1, prem, fmt_curr)
        
        # Exact Average Rate Level using continuous parallelogram geometric superposition
        # We use an array formula (SUMPRODUCT) to sum the differential impacts of all rate changes
        # Z = (RC_Date - CY_Jan_1) / 365
        # IFS(ISBLANK(RC_Date), 0, Z >= 1, 0, Z > 0, (1-Z)^2 / 2, Z > -1, 1 - (1+Z)^2 / 2, TRUE, 1)
        z_array = f"({rc_date_col} - DATE(A{row+1}, 1, 1)) / 365.25"
        
        # Excel array formula trick: 
        # Weights = (Z>=1)*0 + AND(Z>0, Z<1)*(1-Z)^2/2 + AND(Z>-1, Z<=0)*(1 - (1+Z)^2/2) + (Z<=-1)*1
        # Since Excel AND doesn't work well in arrays, we use nested IFs.
        weight_array = f'IF(ISNUMBER({rc_date_col}), IF({z_array} >= 1, 0, IF({z_array} > 0, ((1-{z_array})^2)/2, IF({z_array} > -1, 1 - ((1+{z_array})^2)/2, 1))), 0)'
        
        avg_level_formula = f'=SUMPRODUCT({rc_diff_col}, {weight_array}) + 1' # +1 for the base index
        # To enter as array formula, we just use SUM. If the user has modern Excel, SUM works natively as an array.
        # SUMPRODUCT also works natively with arrays in most cases.
        avg_level_formula_safe = f'=SUMPRODUCT({rc_diff_col}, IF(ISNUMBER({rc_date_col}), IF({z_array} >= 1, 0, IF({z_array} > 0, ((1-{z_array})^2)/2, IF({z_array} > -1, 1 - ((1+{z_array})^2)/2, 1))), 0))'
        # Wait, for the base, the diff for the very first row is just the base level (e.g. 1.0), and its date is far in the past. 
        # Ah, in Rate History row 2, D2 is 1.0 (Incremental Diff). Its Date is 2015, which is Z <= -1. So weight is 1. It adds 1.0!
        # So we don't need the '+ 1'. 
        avg_level_formula_final = f'=SUM(IF(ISNUMBER({rc_date_col}), {rc_diff_col} * IF({z_array} >= 1, 0, IF({z_array} > 0, ((1-{z_array})^2)/2, IF({z_array} > -1, 1 - ((1+{z_array})^2)/2, 1))), 0))'
        
        ws_cy.write_array_formula(f'C{row+1}:C{row+1}', avg_level_formula_final, fmt_hilite)
        
        # CY On-Level Factor = Current Level / Exact Avg Rate Level
        ws_cy.write_formula(row, 3, f'={current_level_ref} / C{row+1}', fmt_hilite)
        
        # On-Level Premium = Earned Premium * Factor
        ws_cy.write_formula(row, 4, f'=B{row+1} * D{row+1}', fmt_hilite_c)
        
    # --- 3. PY Exact Textbook Method (Triangular Weights) ---
    ws_py = workbook.add_worksheet("3. PY Exact Textbook Method")
    ws_py.set_column('A:A', 12)
    ws_py.set_column('B:E', 22)
    
    ws_py.write_row('A1', ["Policy Year", "Earned Premium", "Exact PY Avg Rate Level", "PY On-Level Factor", "On-Level Premium"], fmt_header)
    
    for i, (yr, prem) in enumerate(premium_data):
        row = i + 1
        ws_py.write_number(row, 0, yr, fmt_bold)
        ws_py.write_number(row, 1, prem, fmt_curr)
        
        # PY Exact Avg Rate Level uses triangular weights over 24 months.
        # Instead of 24 columns, we can build the formula identically using superposition.
        # A rate change at Z_py = (RC_Date - PY_Jan_1) / 365.25.
        # For PY, the area affected:
        # If Z_py >= 2: W = 0
        # If 1 <= Z_py < 2: The rate change happens in the second year. Area after = (2 - Z_py)^2 / 2
        # If 0 <= Z_py < 1: The rate change happens in the first year. 
        #   Area before = Z_py^2 / 2. Since total area is 1, Area after = 1 - Z_py^2 / 2.
        # If Z_py < 0: W = 1
        
        z_py = f"({rc_date_col} - DATE(A{row+1}, 1, 1)) / 365.25"
        weight_py = f'IF(ISNUMBER({rc_date_col}), IF({z_py} >= 2, 0, IF({z_py} >= 1, ((2-{z_py})^2)/2, IF({z_py} > 0, 1 - ({z_py}^2)/2, 1))), 0)'
        
        py_avg_level_formula = f'=SUM(IF(ISNUMBER({rc_date_col}), {rc_diff_col} * {weight_py}, 0))'
        
        ws_py.write_array_formula(f'C{row+1}:C{row+1}', py_avg_level_formula, fmt_hilite)
        
        # PY Factor
        ws_py.write_formula(row, 3, f'={current_level_ref} / C{row+1}', fmt_hilite)
        # OLP
        ws_py.write_formula(row, 4, f'=B{row+1} * D{row+1}', fmt_hilite_c)
        

    workbook.close()
    print("Successfully generated Textbook_Method_Rater.xlsx")

if __name__ == "__main__":
    generate_textbook_rater()
