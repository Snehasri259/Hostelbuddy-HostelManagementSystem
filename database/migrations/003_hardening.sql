-- 003_hardening.sql
-- Fixes found in review:
--  * app_users.username was VARCHAR(60) but is used to store e-mail addresses (students.email is VARCHAR(160))
--  * adds columns needed for session revocation after password change and brute-force lockout
--  * blocks E/F had academic_year NULL, so the allocation check let ANY boy into either block; adds min_year/max_year
--  * adds missing indexes (overdue-outpass job, list pages, audit lookups) and a visitor time-window CHECK
ALTER TABLE app_users
  MODIFY username VARCHAR(160) NOT NULL,
  ADD COLUMN password_changed_at DATETIME NULL AFTER must_change_password,
  ADD COLUMN failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER password_changed_at,
  ADD COLUMN locked_until DATETIME NULL AFTER failed_login_count;

ALTER TABLE visitor_requests
  ADD CONSTRAINT chk_visit_window CHECK (visit_end IS NULL OR visit_end > visit_start);

ALTER TABLE guardians
  ADD UNIQUE KEY uq_guardian_student_phone (student_id, phone);

CREATE INDEX idx_outpass_overdue    ON outpasses (status, expected_return_time);
CREATE INDEX idx_outpass_student    ON outpasses (student_id, status);
CREATE INDEX idx_visitor_student    ON visitor_requests (student_id, status);
CREATE INDEX idx_complaint_student  ON complaints (student_id, status);
CREATE INDEX idx_notice_visibility  ON notices (is_active, audience, block_id, publish_at);
CREATE INDEX idx_audit_actor        ON audit_logs (actor_user_id, created_at);
CREATE INDEX idx_auth_tokens_user   ON auth_tokens (user_id, token_type);

-- Year range per block (A-D: one year each, E: years 1-2, F: years 3-4). Enforced by the allocation API.
ALTER TABLE blocks
  ADD COLUMN min_year TINYINT UNSIGNED NULL AFTER academic_year,
  ADD COLUMN max_year TINYINT UNSIGNED NULL AFTER min_year;

UPDATE blocks SET
  min_year = COALESCE(academic_year, CASE block_code WHEN 'E' THEN 1 WHEN 'F' THEN 3 END),
  max_year = COALESCE(academic_year, CASE block_code WHEN 'E' THEN 2 WHEN 'F' THEN 4 END);
