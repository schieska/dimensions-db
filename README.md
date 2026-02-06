# 📏 Dimensions DB

A collaborative, open-source database of storage containers, drawers, and furniture dimensions. Perfect for 3D designers, organization enthusiasts, and app developers.

## 🚀 How to Use the Database

There are several ways to integrate this data into your project, depending on your needs.

### 1. Simple JSON Fetch (Direct Web Apps)
If you are building a website or simple app, you can fetch the data directly from our CDN (via GitHub Pages). This ensures you always have the latest measurements without hosting anything yourself.

- **Main Index**: `https://<user.github.io/dimensions-db/index.json`
- **Full Database**: `https://<user.github.io/dimensions-db/database.json`
- **Individual Items**: `https://<user.github.io/dimensions-db/items/{item_id}.json`

**Example Usage (JavaScript):**
```js
const response = await fetch('https://<user.github.io/dimensions-db/database.json');
const data = await response.json();
const drawers = data.items.filter(i => i.type === 'drawer');
```

---

### 2. Database Integration (Supabase / PostgreSQL)
If you need complex queries (e.g., "Find all boxes that fit in a space of 30x40cm"), you should import the data into a real database.

1.  **Run the Schema**: Copy the contents of [`schema/supabase-schema.sql`](./schema/supabase-schema.sql) into your SQL editor.
2.  **Import Data**: Use a script like [`scripts/import-supabase.js`](./scripts/import-supabase.js) or simply download `dist/database.json` and upload it to your DB using your preferred ETL tool.

**Why use the SQL version?**
- Native support for nested parts (parent/child relationships).
- High-performance filtering on dimensions and materials.
- Full-text search for brand and product names.

---

### 3. Staying Updated (CI/CD Pipeline)
To keep your own database perfectly synced with this project, you can add a step to your CI/CD process to fetch the latest `database.json`.

#### Option A: Simple Fetch (GitHub Actions)
Add this to your own project's `.github/workflows/sync-containers.yml`:
```yaml
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch Latest Container Database
        run: |
          # Replace <user> with the repository owner
          curl -L -o data/dimensions.json https://raw.githubusercontent.com/<user>/dimensions-db/main/dist/database.json
      
      - name: Sync to Supabase/Postgres
        run: node scripts/sync-to-db.js
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

#### Option B: SQL Sync via Migration
If you manage your database with migrations, you can use our [SQL Schema](./schema/supabase-schema.sql) and then use a `COPY` or `INSERT` command from the JSON file during your deployment.

---

## 🛠 Project Schema Reference
- **`inner_size`**: The usable volume inside the container.
- **`outer_size`**: The physical space the container takes up on a shelf.
- **`parts`**: Relationship mapping (e.g., Which drawers belong in which cabinet).
- **`identifiers`**: Global IDs (MPN, EAN, SKU) to match physical retail items.

---

## 🛠 Project Structure
- `/src/items`: **Source of truth.** Human-editable JSON files.
- `/schema`: JSON Schemas and SQL definitions.
- `/dist`: **Generated output.** Optimized for consumption (converted units, pre-calculated metadata).

## 🤝 Contributing
Want to add a new box or improve an existing measurement? See [CONTRIBUTING.md](./contributing.md).
