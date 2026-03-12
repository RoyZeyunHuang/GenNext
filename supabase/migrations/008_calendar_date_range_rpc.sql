CREATE OR REPLACE FUNCTION get_calendar_by_date_range(
  start_date date,
  end_date date
)
RETURNS SETOF calendar_events AS $$
  SELECT * FROM calendar_events
  WHERE "date" >= start_date AND "date" <= end_date
  ORDER BY "date", start_time;
$$ LANGUAGE sql;
