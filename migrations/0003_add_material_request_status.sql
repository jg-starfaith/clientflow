ALTER TABLE material_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'not_requested' CHECK (status IN ('not_requested', 'requested', 'submitted'));

ALTER TABLE material_requests ADD COLUMN submitted_at TEXT;
