"""Regression fixtures transcribed from malformed PDF table shapes, not catalog data."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("importer", Path(__file__).parents[1] / "import-sundance-catalog.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

class GridExtractionTest(unittest.TestCase):
    def test_width_bands_do_not_turn_first_prices_into_heights(self):
        grid = importer.extract_grid([
            [None, '18" – 23"', '26"', '29"', '32"'],
            ['42"', '228', '240', '252', '258'],
            ['48"', '240', '252', '258', '276'],
            ['54"', '252', '258', '276', '282'],
        ])
        self.assertEqual(grid['widths'], [23, 26, 29, 32])
        self.assertEqual(grid['heights'], [42, 48, 54])
        self.assertEqual(grid['prices'][0], [228, 240, 252, 258])

    def test_merged_height_cells_retain_final_row(self):
        grid = importer.extract_grid([
            ['Height', None, '24', '30', '36', '42'],
            [None, '120', '1016', '1281', '1459', '1634'],
            [None, '132', '1166', '1472', '1675', '1879'],
            ['144', None, '1342', '1693', '1927', '2162'],
        ])
        self.assertEqual(grid['heights'], [120, 132, 144])
        self.assertEqual(grid['prices'][-1], [1342, 1693, 1927, 2162])

    def test_roller_typographic_tick_is_a_width_unit(self):
        self.assertEqual(importer.width_number('118`'), 118)
        self.assertIsNone(importer.number('118`')) # prices remain strict

if __name__ == '__main__':
    unittest.main()
