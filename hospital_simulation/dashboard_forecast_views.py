"""Load pathway forecast SQL views from sql/hospital_forecast_views.sql."""

from pathlib import Path


def get_forecast_view_sql() -> str:
    sql_path = Path(__file__).resolve().parents[1] / "sql" / "hospital_forecast_views.sql"
    return sql_path.read_text(encoding="utf-8")
