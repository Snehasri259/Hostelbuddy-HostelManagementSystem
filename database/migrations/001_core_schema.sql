-- 001_core_schema.sql
-- Core tables for HostelBuddy (MySQL 8.0+). Run via `npm run db:migrate` (tracked, safe to re-run).
-- This file never drops anything. Use `npm run db:reset-dev` for a dev-only wipe.


CREATE TABLE IF NOT EXISTS roles (
  role_id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_code VARCHAR(20) NOT NULL UNIQUE,
  role_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS blocks (
  block_id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  block_code CHAR(1) NOT NULL UNIQUE,
  block_name VARCHAR(80) NOT NULL,
  gender ENUM('GIRLS','BOYS') NOT NULL,
  academic_year TINYINT UNSIGNED NULL,
  notes VARCHAR(255),
  CHECK (academic_year IS NULL OR academic_year BETWEEN 1 AND 4)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  student_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_code VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  gender ENUM('GIRL','BOY') NOT NULL,
  btech_year TINYINT UNSIGNED NOT NULL,
  department VARCHAR(20) NOT NULL,
  email VARCHAR(160) UNIQUE,
  phone VARCHAR(20),
  status ENUM('ACTIVE','INACTIVE','GRADUATED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (btech_year BETWEEN 1 AND 4)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
  room_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  block_id TINYINT UNSIGNED NOT NULL,
  room_number VARCHAR(12) NOT NULL,
  floor_number TINYINT UNSIGNED NOT NULL,
  capacity TINYINT UNSIGNED NOT NULL DEFAULT 4,
  status ENUM('AVAILABLE','MAINTENANCE','CLOSED') NOT NULL DEFAULT 'AVAILABLE',
  UNIQUE KEY uq_room_in_block (block_id, room_number),
  CONSTRAINT fk_rooms_block FOREIGN KEY (block_id) REFERENCES blocks(block_id),
  CHECK (capacity BETWEEN 1 AND 24)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS beds (
  bed_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  room_id INT UNSIGNED NOT NULL,
  bed_number TINYINT UNSIGNED NOT NULL,
  status ENUM('AVAILABLE','MAINTENANCE','CLOSED') NOT NULL DEFAULT 'AVAILABLE',
  UNIQUE KEY uq_bed_in_room (room_id, bed_number),
  CONSTRAINT fk_beds_room FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  CHECK (bed_number BETWEEN 1 AND 24)
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS wardens (
  warden_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  staff_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  gender ENUM('FEMALE','MALE') NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(160) UNIQUE,
  block_id TINYINT UNSIGNED NOT NULL UNIQUE,
  employment_status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_warden_block FOREIGN KEY (block_id) REFERENCES blocks(block_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  admin_id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  staff_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  gender ENUM('FEMALE','MALE') NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(160) NOT NULL UNIQUE,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_users (
  user_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL UNIQUE,
  warden_id INT UNSIGNED NULL UNIQUE,
  admin_id INT UNSIGNED NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
  CONSTRAINT fk_user_student FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_user_warden FOREIGN KEY (warden_id) REFERENCES wardens(warden_id),
  CONSTRAINT fk_user_admin FOREIGN KEY (admin_id) REFERENCES admins(admin_id),
  CHECK (
    (student_id IS NOT NULL) + (warden_id IS NOT NULL) + (admin_id IS NOT NULL) <= 1
  )
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS allocations (
  allocation_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  bed_id INT UNSIGNED NOT NULL,
  allocation_start DATE NOT NULL,
  allocation_end DATE NULL,
  allocation_status ENUM('ACTIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  allocated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_student_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN allocation_status = 'ACTIVE' THEN student_id ELSE NULL END) STORED,
  active_bed_id INT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN allocation_status = 'ACTIVE' THEN bed_id ELSE NULL END) STORED,
  CONSTRAINT fk_alloc_student FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_alloc_bed FOREIGN KEY (bed_id) REFERENCES beds(bed_id),
  CONSTRAINT fk_allocated_by FOREIGN KEY (allocated_by_user_id) REFERENCES app_users(user_id),
  UNIQUE KEY uq_one_active_allocation_per_student (active_student_id),
  UNIQUE KEY uq_one_active_student_per_bed (active_bed_id),
  INDEX idx_allocation_status (allocation_status),
  CHECK (allocation_end IS NULL OR allocation_end >= allocation_start)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(80) NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES app_users(user_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- Reference data required by the application (not demo data).
INSERT IGNORE INTO roles (role_code, role_name) VALUES
('STUDENT','Student'),('WARDEN','Warden'),('ADMIN','Administrator');

INSERT IGNORE INTO blocks (block_code, block_name, gender, academic_year, notes) VALUES
('A','Girls Block A - B.Tech Year 1','GIRLS',1,'Girls first-year block'),
('B','Girls Block B - B.Tech Year 2','GIRLS',2,'Girls second-year block'),
('C','Girls Block C - B.Tech Year 3','GIRLS',3,'Girls third-year block'),
('D','Girls Block D - B.Tech Year 4','GIRLS',4,'Girls fourth-year block'),
('E','Boys Block E - B.Tech Years 1 and 2','BOYS',NULL,'Boys first- and second-year students'),
('F','Boys Block F - B.Tech Years 3 and 4','BOYS',NULL,'Boys third- and fourth-year students');

-- Read-only convenience view (not used by the API; never grant it to student/warden DB users).
CREATE OR REPLACE VIEW v_admin_all_allocations AS
SELECT s.student_code, s.full_name, s.gender, s.btech_year, s.department,
       bl.block_code, r.room_number, be.bed_number,
       a.allocation_start, a.allocation_end, a.allocation_status
FROM allocations a
JOIN students s ON s.student_id = a.student_id
JOIN beds be ON be.bed_id = a.bed_id
JOIN rooms r ON r.room_id = be.room_id
JOIN blocks bl ON bl.block_id = r.block_id;
