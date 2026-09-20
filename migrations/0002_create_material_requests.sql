CREATE TABLE material_requests (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	customer_id INTEGER NOT NULL,
	name TEXT NOT NULL CHECK (length(trim(name)) > 0),
	note TEXT NOT NULL DEFAULT '',
	due_date TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX material_requests_customer_id ON material_requests(customer_id);
