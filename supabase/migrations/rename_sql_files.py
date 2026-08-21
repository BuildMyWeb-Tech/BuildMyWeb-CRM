from pathlib import Path

folder = Path(__file__).parent

renames = [
    ("050_file_manager.sql", "042_file_manager.sql"),
    ("049_daily_tasks.sql", "050_daily_tasks.sql"),
    ("048_kanban_boards.sql", "049_kanban_boards.sql"),
    ("047_custom_fields.sql", "048_custom_fields.sql"),
    ("046_client_directory.sql", "047_client_directory.sql"),
    ("045_employee_role_ranking.sql", "046_employee_role_ranking.sql"),
    ("044_employee_role.sql", "045_employee_role.sql"),
    ("042_bmw_office.sql", "043_bmw_office.sql"),
]

for old, new in renames:
    old_path = folder / old
    new_path = folder / new

    if not old_path.exists():
        print(f"SKIP: {old} not found")
        continue

    if new_path.exists():
        print(f"ERROR: {new} already exists — stopping")
        break

    old_path.rename(new_path)
    print(f"Renamed: {old} -> {new}")