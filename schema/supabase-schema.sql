-- Open Container Database - Supabase/PostgreSQL Schema

-- 1. Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    type TEXT,
    identifier_types TEXT[]
);

-- 2. Items Table
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    brand_id TEXT REFERENCES brands(id),
    description TEXT,
    visibility TEXT[],
    materials TEXT[],
    features TEXT[],
    
    -- Dimensions (JSONB for flexibility with Polygons/Lofts)
    inner_size_mm JSONB,
    outer_size_mm JSONB,
    inner_size_in JSONB,
    outer_size_in JSONB,
    
    referenced_by_count INTEGER DEFAULT 0,
    added_by TEXT,
    status TEXT,
    accuracy TEXT,
    identifiers JSONB, -- Map of mpn, ean, upc, etc.
    
    metadata JSONB, -- Any extra fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Item Parts (Relationships)
CREATE TABLE IF NOT EXISTS item_parts (
    parent_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    child_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    PRIMARY KEY (parent_id, child_id)
);

-- 4. Indices for fast searching
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_brand ON items(brand_id);
