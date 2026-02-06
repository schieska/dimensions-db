---
name: project_qa
description: Guides the agent through validating data quality and building the distribution database.
---

# Project QA Skill

Use this skill to ensure all data is valid and the distribution build is successful.

## 1. Local Validation
Check specific files or the entire `src` directory for schema compliance.

```bash
# Validate all items
npm run validate

# Validate a specific file
npm run validate src/items/brand/series/item.json
```

## 2. Generate Distribution
Generate the `dist/` directory which includes the converted sizes (inches) and the searchable index.

```bash
npm run build
```

## 3. Review Build Output
Check the `dist/` folder:
- `dist/index.json`: Lightweight searchable index.
- `dist/database.json`: Full combined database.
- `dist/items/`: Individual processed item files.

## 4. Troubleshooting
If validation fails:
1. Open the file mentioned in the error.
2. Check the schema at `schema/item.schema.json`.
3. Common fixes:
   - Ensure `id` is alphanumeric and lowercase.
   - Ensure `inner_size` or `outer_size` is provided.
   - Check that `measurements` has at least one entry with a valid `by` field.
