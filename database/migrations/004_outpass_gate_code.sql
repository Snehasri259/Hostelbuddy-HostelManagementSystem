-- 004_outpass_gate_code.sql
-- Each approved outpass gets an 8-character gate code. Security/wardens enter it at the gate to mark a student
-- as departed or returned (a QR image can be layered on top of this later without changing the data model).
ALTER TABLE outpasses
  ADD COLUMN pass_code CHAR(8) NULL AFTER decision_note,
  ADD UNIQUE KEY uq_outpass_pass_code (pass_code);
