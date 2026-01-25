-- ============================================================
-- MIGRATION: Create Users and Workspaces Tables
-- Version: 001
-- Date: 2026-01-13
-- Description: Set up proper database structure for users and workspaces
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CREATE USERS TABLE
-- ============================================================
-- This table stores application-level user data
-- Links to Supabase auth.users via id (same UUID)

CREATE TABLE IF NOT EXISTS users (
    -- Primary key - matches Supabase auth.users.id
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User information
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    
    -- Role management
    role VARCHAR(20) NOT NULL DEFAULT 'USER' 
        CHECK (role IN ('USER', 'ADMIN')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. UPDATE WORKSPACES TABLE
-- ============================================================
-- Add user_id foreign key if not exists
-- Note: The workspaces table already exists, we're modifying it

-- First, add user_id column if it doesn't exist
DO $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspaces' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE workspaces 
        ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index on user_id for faster joins
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);

-- ============================================================
-- 3. CREATE VIEW FOR USERS WITH WORKSPACE COUNT
-- ============================================================

CREATE OR REPLACE VIEW users_with_workspaces AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.created_at,
    u.updated_at,
    COUNT(w.id) AS workspace_count,
    COALESCE(
        json_agg(
            json_build_object(
                'id', w.id,
                'name', w.name,
                'type', w.data_type,
                'created_at', w.created_at
            )
        ) FILTER (WHERE w.id IS NOT NULL),
        '[]'::json
    ) AS workspaces
FROM users u
LEFT JOIN workspaces w ON w.user_id = u.id
GROUP BY u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at;

-- ============================================================
-- 4. SYNC FUNCTION: Create user from Supabase auth
-- ============================================================
-- This function creates a user record when a new auth user signs up

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        'USER',
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users (only works if you have access to auth schema)
-- Note: This may need to be run separately with superuser privileges
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Function to get all workspaces for a user
CREATE OR REPLACE FUNCTION get_user_workspaces(p_user_id UUID)
RETURNS TABLE (
    workspace_id UUID,
    workspace_name VARCHAR,
    workspace_type VARCHAR,
    workspace_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.name,
        w.data_type::VARCHAR,
        w.description,
        w.created_at,
        w.updated_at
    FROM workspaces w
    WHERE w.user_id = p_user_id
    ORDER BY w.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user with their workspaces
CREATE OR REPLACE FUNCTION get_user_with_workspaces(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'user', json_build_object(
            'id', u.id,
            'email', u.email,
            'full_name', u.full_name,
            'role', u.role,
            'created_at', u.created_at
        ),
        'workspaces', COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id', w.id,
                    'name', w.name,
                    'type', w.data_type,
                    'description', w.description,
                    'created_at', w.created_at
                )
            )
            FROM workspaces w
            WHERE w.user_id = u.id),
            '[]'::json
        )
    ) INTO result
    FROM users u
    WHERE u.id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own data
CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Admins can read all users
CREATE POLICY users_admin_select ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Policy: Users can read their own workspaces
CREATE POLICY workspaces_select_own ON workspaces
    FOR SELECT
    USING (user_id = auth.uid() OR user_id IS NULL);

-- Policy: Users can insert their own workspaces
CREATE POLICY workspaces_insert_own ON workspaces
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own workspaces
CREATE POLICY workspaces_update_own ON workspaces
    FOR UPDATE
    USING (user_id = auth.uid());

-- Policy: Users can delete their own workspaces
CREATE POLICY workspaces_delete_own ON workspaces
    FOR DELETE
    USING (user_id = auth.uid());

-- Policy: Admins can read all workspaces
CREATE POLICY workspaces_admin_select ON workspaces
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 001 completed successfully!';
    RAISE NOTICE '   - Users table created/updated';
    RAISE NOTICE '   - Workspaces table updated with user_id FK';
    RAISE NOTICE '   - Views and functions created';
    RAISE NOTICE '   - RLS policies applied';
END $$;
