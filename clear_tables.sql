-- WARNING: THIS WILL DELETE ALL DATA FROM THESE TABLES.
-- ENSURE YOU HAVE BACKUPS AND HAVE TESTED THIS.

-- 1. Clear out individual screening decisions
DELETE FROM screening_decisions;
-- Output: Query successful, 0 rows affected (or N rows affected)

-- 2. Clear out filtering results
DELETE FROM filtering_results;
-- Output: Query successful...

-- 3. Clear out finalized article records (if you have this table)
-- If you don't have 'finalized_articles', skip this.
-- DELETE FROM finalized_articles;
-- Output: Query successful...

-- 4. Clear out all imported/created articles
DELETE FROM articles;
-- Output: Query successful...

-- 5. Clear out all defined AI agents
DELETE FROM ai_agents;
-- Output: Query successful...

-- 6. Clear out all project invitations
DELETE FROM project_invitations;
-- Output: Query successful...

-- 7. Clear out all project memberships (users will no longer be part of any project)
DELETE FROM project_members;
-- Output: Query successful...

-- 8. Clear out all project definitions
-- (This might cascade delete related data if ON DELETE CASCADE is set on FKs in other tables referencing 'projects.id')
DELETE FROM projects;
-- Output: Query successful...

-- 9. Clear out all user profiles (users in auth.users will remain but without these profile details)
-- The trigger 'on_auth_user_created' would attempt to re-create a profile if a user record in auth.users
-- was somehow re-inserted or if the trigger was modified to run on login (not typical).
DELETE FROM profiles;
-- Output: Query successful... 