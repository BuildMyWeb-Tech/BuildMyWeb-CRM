from pathlib import Path

folder = Path(__file__).parent

renames = [
    ("042_file_manager.sql", "042_temp.sql"),
    ("043_bmw_office.sql", "042_bmw_office.sql"),
    ("042_temp.sql", "043_file_manager.sql"),
]

for old, new in renames:
    old_path = folder / old
    new_path = folder / new

    if not old_path.exists():
        print(f"ERROR: {old} not found — stopping")
        break

    if new_path.exists():
        print(f"ERROR: {new} already exists — stopping")
        break

    old_path.rename(new_path)
    print(f"Renamed: {old} -> {new}")