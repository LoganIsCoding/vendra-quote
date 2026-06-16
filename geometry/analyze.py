import json
import os
import sys
from engine import analyze

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python analyze.py <file.step>", file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(f"Error: file not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    if not filepath.lower().endswith((".step", ".stp")):
        print(f"Error: file must be a .step or .stp file", file=sys.stderr)
        sys.exit(1)

    try:
        result = analyze(filepath)
        result["file"] = filepath
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: failed to parse STEP file: {e}", file=sys.stderr)
        sys.exit(1)
