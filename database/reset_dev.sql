-- DEV ONLY. Wipes every HostelBuddy table. Run with: npm run db:reset-dev (refuses in production).
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW  IF EXISTS v_admin_all_allocations;
DROP TABLE IF EXISTS outpasses, visitor_requests, guardians, notifications, notices, complaints, auth_tokens,
                     audit_logs, allocations, beds, rooms, students, app_users, wardens, admins, blocks, roles,
                     schema_migrations;
SET FOREIGN_KEY_CHECKS = 1;
