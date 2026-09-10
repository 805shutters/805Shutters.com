"""Regression checks for source formats used by July/August and September."""
import importlib.util
import unittest
from datetime import datetime
from pathlib import Path
from openpyxl import Workbook

spec = importlib.util.spec_from_file_location('roller_source', Path(__file__).with_name('generate-norman-roller-v2-source.py'))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)

class SourceFormatRegression(unittest.TestCase):
    def test_exact_fabric_tokens_preserve_old_codes_and_new_five_digit_codes(self):
        self.assertEqual(source.FABRIC_TOKEN.findall('AA0305 / AB06113 / AB06117 / B12345 / AA0305-A'),
                         ['AA0305', 'AB06113', 'AB06117', 'B12345', 'AA0305-A'])
        self.assertEqual(source.FABRIC_TOKEN.findall('XAB06113 AB061130 AA03050X'), [])

    def test_september_text_date_and_trailing_sheet_space(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Revision Log '
        sheet.append([datetime(2026, 6, 29), datetime(2026, 8, 1), 'August'])
        sheet.append([datetime(2026, 7, 31), '9/1/2026', 'September'])
        self.assertEqual(source.source_release(workbook)['effectiveFrom'], '2026-09-01')
        self.assertEqual(source.source_release(workbook)['sourceRef'], dict(sheet='Revision Log ', row=2, range='A2:C2'))

    def test_original_excel_date_format_remains_unchanged(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Revision Log'
        sheet.append([datetime(2026, 6, 29), datetime(2026, 8, 1), 'August'])
        release = source.source_release(workbook)
        self.assertEqual(release['effectiveFrom'], '2026-08-01')
        self.assertEqual(release['sourceRef'], dict(sheet='Revision Log', row=1, range='A1:C1'))

if __name__ == '__main__':
    unittest.main()
