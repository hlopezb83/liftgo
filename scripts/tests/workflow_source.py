"""Read one manual job without adding a YAML dependency before database bootstrap."""
import re
from pathlib import Path

def workflow_job(name):
    text = (Path(__file__).parents[2] / '.github/workflows/validaciones-manuales.yml').read_text(encoding='utf-8')
    match = re.search(r'^  ' + re.escape(name) + r':\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))', text, re.M)
    if not match:
        raise ValueError('Missing manual job ' + name)
    return text.split('\njobs:\n', 1)[0] + '\njobs:\n' + match[0] + '\n'
