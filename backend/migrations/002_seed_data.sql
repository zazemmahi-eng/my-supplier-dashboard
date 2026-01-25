-- ============================================================
-- SEED DATA: Test Users and Workspaces
-- Version: 001
-- Date: 2026-01-13
-- Description: Insert example data for testing
-- ============================================================

-- ============================================================
-- 1. INSERT TEST USERS
-- ============================================================

-- Admin User (the existing admin)
INSERT INTO users (id, email, full_name, role, created_at)
VALUES (
    '6e3943c2-c5b5-40a2-8439-4d72e792e64c',
    'za.zemmahi@edu.umi.ac.ma',
    'Zakariae Zemmahi',
    'ADMIN',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = 'ADMIN',
    updated_at = NOW();

-- Regular User 1
INSERT INTO users (id, email, full_name, role, created_at)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    'user1@example.com',
    'Jean Dupont',
    'USER',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = NOW();

-- Regular User 2
INSERT INTO users (id, email, full_name, role, created_at)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-222222222222',
    'user2@example.com',
    'Marie Martin',
    'USER',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = NOW();

-- ============================================================
-- 2. UPDATE EXISTING WORKSPACES WITH OWNER
-- ============================================================

-- Assign existing workspaces to admin user
UPDATE workspaces 
SET user_id = '6e3943c2-c5b5-40a2-8439-4d72e792e64c'
WHERE user_id IS NULL;

-- ============================================================
-- 3. CREATE WORKSPACES FOR TEST USERS
-- ============================================================

-- User 1 - Workspace 1 (Case A - Delays)
INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
VALUES (
    'ws-user1-001-aaaa-bbbb-cccccccccccc',
    'Analyse Fournisseurs Q1',
    'Analyse des retards de livraison pour le premier trimestre',
    'delays',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- User 1 - Workspace 2 (Case B - Late Days)
INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
VALUES (
    'ws-user1-002-aaaa-bbbb-cccccccccccc',
    'Suivi Qualité 2026',
    'Évaluation de la qualité et des jours de retard',
    'late_days',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-111111111111',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- User 2 - Workspace 1 (Case C - Mixed)
INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
VALUES (
    'ws-user2-001-aaaa-bbbb-cccccccccccc',
    'Dashboard Production',
    'Vue combinée des métriques de production',
    'mixed',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-222222222222',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- User 2 - Workspace 2 (Case A - Delays)
INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
VALUES (
    'ws-user2-002-aaaa-bbbb-cccccccccccc',
    'Audit Fournisseurs',
    'Audit annuel des performances fournisseurs',
    'delays',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-222222222222',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. VERIFICATION QUERIES
-- ============================================================

-- Show all users with their workspace counts
DO $$
DECLARE
    user_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'SEED DATA VERIFICATION';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'USERS:';
    RAISE NOTICE '------';
    
    FOR user_record IN 
        SELECT u.email, u.full_name, u.role, COUNT(w.id) as ws_count
        FROM users u
        LEFT JOIN workspaces w ON w.user_id = u.id
        GROUP BY u.id, u.email, u.full_name, u.role
        ORDER BY u.role DESC, u.email
    LOOP
        RAISE NOTICE '  % (%) - % - % workspace(s)', 
            user_record.email, 
            user_record.role,
            COALESCE(user_record.full_name, 'No name'),
            user_record.ws_count;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'WORKSPACES:';
    RAISE NOTICE '-----------';
END $$;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Seed data inserted successfully!';
    RAISE NOTICE '   - 1 Admin user';
    RAISE NOTICE '   - 2 Regular users';
    RAISE NOTICE '   - 4+ Workspaces total';
END $$;
