import io
import xlsxwriter
from datetime import datetime
from models import AggregatedOnLevelRequest

def generate_textbook_rater_stream(req: AggregatedOnLevelRequest) -> io.BytesIO:
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
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
    
    rate_changes = req.rate_changes
    merged_rc = []
    has_base = False
    
    for rc in rate_changes:
        merged_rc.append({"date": rc.date, "pct": rc.pct / 100.0})
        if rc.pct == 0.0:
            has_base = True
            
    if not has_base and len(merged_rc) > 0:
        base_date = datetime(1900, 1, 1).date()
        merged_rc.insert(0, {"date": base_date, "pct": 0.0})
    elif len(merged_rc) == 0:
        base_date = datetime(1900, 1, 1).date()
        merged_rc.append({"date": base_date, "pct": 0.0})
        
    merged_rc = sorted(merged_rc, key=lambda x: x["date"])
    
    for i, rc in enumerate(merged_rc):
        row = i + 1
        ws_inputs.write_datetime(row, 0, datetime(rc["date"].year, rc["date"].month, rc["date"].day), fmt_date)
        ws_inputs.write_number(row, 1, rc["pct"], fmt_pct)
        
        if row == 1:
            ws_inputs.write_number(row, 2, 1.0, fmt_factor)
            ws_inputs.write_number(row, 3, 1.0, fmt_factor)
        else:
            ws_inputs.write_formula(row, 2, f'=IF(A{row+1}="","", C{row}*(1+B{row+1}))', fmt_factor)
            ws_inputs.write_formula(row, 3, f'=IF(A{row+1}="","", C{row+1}-C{row})', fmt_factor)
            
    max_rc_rows = len(merged_rc) + 15
    
    for i in range(len(merged_rc), max_rc_rows):
        row = i + 1
        ws_inputs.write_blank(row, 0, None, fmt_date)
        ws_inputs.write_blank(row, 1, None, fmt_pct)
        ws_inputs.write_formula(row, 2, f'=IF(A{row+1}="","", C{row}*(1+B{row+1}))', fmt_factor)
        ws_inputs.write_formula(row, 3, f'=IF(A{row+1}="","", C{row+1}-C{row})', fmt_factor)
        
    eval_row = max_rc_rows + 2
    ws_inputs.write(eval_row, 0, "Evaluation Date:", fmt_bold)
    ed = req.evaluation_date
    ws_inputs.write_datetime(eval_row, 1, datetime(ed.year, ed.month, ed.day), fmt_date)
    ws_inputs.write(eval_row + 1, 0, "Current Level:", fmt_bold)
    ws_inputs.write_formula(eval_row + 1, 1, f'=VLOOKUP(B{eval_row+1}, A{2}:C{max_rc_rows+1}, 3, TRUE)', fmt_hilite)
    
    current_level_ref = f"'1. Rate History'!$B${eval_row+2}"
    rc_date_col = f"'1. Rate History'!$A$2:$A${max_rc_rows+1}"
    rc_diff_col = f"'1. Rate History'!$D$2:$D${max_rc_rows+1}"
    
    premium_data = sorted(req.premium_by_year, key=lambda x: x.year)
    
    if req.aggregation == "CY":
        ws_cy = workbook.add_worksheet("2. CY Exact Analytic Method")
        ws_cy.set_column('A:A', 12)
        ws_cy.set_column('B:C', 21)
        ws_cy.set_column('D:F', 25)
        
        ws_cy.write_row('A1', ["CY", "Historical Premium", "Exact Avg Rate Level", "CY On-Level Factor", "On-Level Premium"], fmt_header)
        
        for i, row_data in enumerate(premium_data):
            row = i + 1
            ws_cy.write_number(row, 0, row_data.year, fmt_bold)
            ws_cy.write_number(row, 1, row_data.premium, fmt_curr)
            
            # Match the user's analytic_avg_rate_level algorithm constraints precisely:
            # 1. Base Level derived at Jan 1st
            base_date = f"DATE(A{row+1}, 1, 1)"
            base_level_ref = f"VLOOKUP({base_date}, '1. Rate History'!$A$2:$C${max_rc_rows+1}, 3, TRUE)"
            
            # 2. Z calculation limited exclusively to current calendar year rate changes (exact days)
            z_array = f"(({rc_date_col} - DATE(YEAR({rc_date_col}), 1, 1)) / (DATE(YEAR({rc_date_col})+1, 1, 1) - DATE(YEAR({rc_date_col}), 1, 1)))"
            cy_cond = f"(YEAR({rc_date_col}) = A{row+1})"
            
            # 3. Sum of impacted areas
            area_array = f"(((1.0 - {z_array})^2) / 2.0)"
            sum_impact_formula = f"SUM(IF(ISNUMBER({rc_date_col}), IF({cy_cond}, {rc_diff_col} * {area_array}, 0), 0))"
            
            avg_level_formula = f"={base_level_ref} + {sum_impact_formula}"
            
            ws_cy.write_array_formula(f'C{row+1}:C{row+1}', avg_level_formula, fmt_hilite)
            ws_cy.write_formula(row, 3, f'={current_level_ref} / C{row+1}', fmt_hilite)
            ws_cy.write_formula(row, 4, f'=B{row+1} * D{row+1}', fmt_hilite_c)
            
    elif req.aggregation == "PY":
        ws_py = workbook.add_worksheet("2. PY Exact Analytic Method")
        ws_py.set_column('A:A', 12)
        ws_py.set_column('B:E', 22)
        
        ws_py.write_row('A1', ["PY", "Historical Premium", "Exact PY Avg Rate Level", "PY On-Level Factor", "On-Level Premium"], fmt_header)
        
        for i, row_data in enumerate(premium_data):
            row = i + 1
            ws_py.write_number(row, 0, row_data.year, fmt_bold)
            ws_py.write_number(row, 1, row_data.premium, fmt_curr)
            
            # Match the user's compute_py_ep_factor algorithm constraint exactly (24 month loop):
            term = req.policy_term_months
            offset = - (term // 2)
            
            m_arr = 'ROW(INDIRECT("1:24"))'
            eval_date_arr = f'EDATE(DATE(A{row+1} + INT(({m_arr}-1)/12), MOD({m_arr}-1, 12)+1, 15), {offset})'
            level_arr = f'VLOOKUP({eval_date_arr}, \'1. Rate History\'!$A$2:$C${max_rc_rows+1}, 3, TRUE)'
            weight_arr = f'IF({m_arr}<=12, {m_arr}/144.0, (25-{m_arr})/144.0)'
            
            py_avg_level_formula = f'=SUM({level_arr} * {weight_arr})'
            
            ws_py.write_array_formula(f'C{row+1}:C{row+1}', py_avg_level_formula, fmt_hilite)
            ws_py.write_formula(row, 3, f'={current_level_ref} / C{row+1}', fmt_hilite)
            ws_py.write_formula(row, 4, f'=B{row+1} * D{row+1}', fmt_hilite_c)
            
    workbook.close()
    output.seek(0)
    return output
