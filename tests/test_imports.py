import importlib

import pytest

MODULES = [
    "data.fetch_prices",
    "model.dispatch",
    "model.run_year",
    "model.metrics",
    "scripts.run_grid",
]


@pytest.mark.parametrize("name", MODULES)
def test_module_imports(name):
    module = importlib.import_module(name)
    assert module.__doc__
