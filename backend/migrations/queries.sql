-- ============================================================
-- USEFUL QUERIES: Users and Workspaces
-- ============================================================

-- ============================================================
-- 1. GET ALL WORKSPACES FOR A GIVEN USER
-- ============================================================

-- By user ID
SELECT 
    w.id,
    w.name,
    w.description,
    w.data_type AS type,
    w.status,
    w.created_at,
    w.updated_at
FROM workspaces w
WHERE w.user_id = '6e3943c2-c5b5-40a2-8439-4d72e792e64c'  -- Replace with user ID
ORDER BY w.created_at DESC;

-- By email
SELECT 
    w.id,
    w.name,
    w.description,
    w.data_type AS type,
    w.status,
    w.created_at
FROM workspaces w
JOIN users u ON w.user_id = u.id
WHERE u.email = 'za.zemmahi@edu.umi.ac.ma'  -- Replace with email
ORDER BY w.created_at DESC;


-- ============================================================
-- 2. GET ALL USERS WITH THEIR WORKSPACES
-- ============================================================

-- Users with workspace count
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.created_at,
    COUNT(w.id) AS workspace_count
FROM users u
LEFT JOIN workspaces w ON w.user_id = u.id
GROUP BY u.id, u.email, u.full_name, u.role, u.created_at
ORDER BY u.role DESC, workspace_count DESC;

-- Users with workspace details (JSON aggregate)
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.created_at AS user_created_at,
    COALESCE(
        json_agg(
            json_build_object(
                'id', w.id,
                'name', w.name,
                'type', w.data_type,
                'status', w.status,
                'created_at', w.created_at
            )
        ) FILTER (WHERE w.id IS NOT NULL),
        '[]'::json
    ) AS workspaces
FROM users u
LEFT JOIN workspaces w ON w.user_id = u.id
GROUP BY u.id, u.email, u.full_name, u.role, u.created_at
ORDER BY u.role DESC, u.email;


-- ============================================================
-- 3. ADMIN DASHBOARD QUERIES
-- ============================================================

-- Global statistics
SELECT 
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') AS admin_count,
    (SELECT COUNT(*) FROM users WHERE role = 'USER') AS regular_user_count,
    (SELECT COUNT(*) FROM workspaces) AS total_workspaces,
    (SELECT COUNT(*) FROM workspaces WHERE user_id IS NULL) AS orphan_workspaces,
    (SELECT COUNT(DISTINCT user_id) FROM workspaces WHERE user_id IS NOT NULL) AS users_with_workspaces;

-- Workspaces by type
SELECT 
    data_type,
    COUNT(*) AS count
FROM workspaces
GROUP BY data_type
ORDER BY count DESC;

-- Recent activity (last 7 days)
SELECT 
    u.email,
    w.name AS workspace_name,
    w.data_type,
    w.created_at
FROM workspaces w
JOIN users u ON w.user_id = u.id
WHERE w.created_at > NOW() - INTERVAL '7 days'
ORDER BY w.created_at DESC
LIMIT 10;


-- ============================================================
-- 4. USER MANAGEMENT QUERIES
-- ============================================================

-- Find user by email
SELECT * FROM users WHERE email ILIKE '%example%';

-- Get user with all details
SELECT 
    u.*,
    (SELECT COUNT(*) FROM workspaces WHERE user_id = u.id) AS workspace_count
FROM users u
WHERE u.email = 'za.zemmahi@edu.umi.ac.ma';

-- List all admins
SELECT id, email, full_name, created_at
FROM users
WHERE role = 'ADMIN'
ORDER BY created_at;

-- Users without workspaces
SELECT u.id, u.email, u.full_name, u.created_at
FROM users u
LEFT JOIN workspaces w ON w.user_id = u.id
WHERE w.id IS NULL;


-- ============================================================
-- 5. WORKSPACE MANAGEMENT QUERIES
-- ============================================================

-- Get workspace with owner info
SELECT 
    w.*,
    u.email AS owner_email,
    u.full_name AS owner_name
FROM workspaces w
LEFT JOIN users u ON w.user_id = u.id
ORDER BY w.created_at DESC;

-- Find orphan workspaces (no owner)
SELECT * FROM workspaces WHERE user_id IS NULL;

-- Workspaces per user statistics
SELECT 
    u.email,
    COUNT(w.id) AS workspace_count,
    array_agg(w.data_type) AS workspace_types
FROM users u
LEFT JOIN workspaces w ON w.user_id = u.id
GROUP BY u.id, u.email
ORDER BY workspace_count DESC;


-- ============================================================
-- 6. DATA CLEANUP QUERIES
-- ============================================================

-- Assign orphan workspaces to admin
UPDATE workspaces 
SET user_id = '6e3943c2-c5b5-40a2-8439-4d72e792e64c'
WHERE user_id IS NULL;

-- Delete user and their workspaces (cascade)
-- DELETE FROM users WHERE id = 'user-id-here';

-- Archive old workspaces
UPDATE workspaces 
SET status = 'archived'
WHERE created_at < NOW() - INTERVAL '1 year'
  AND status = 'active';
