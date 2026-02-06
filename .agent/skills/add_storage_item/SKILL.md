---
name: add_storage_item
description: Guides the agent in adding a new container or furniture item to the database following project standards.
---

# Add Storage Item Skill

Use this skill to correctly add a new item (box, drawer, unit) to the Open Container Database.

## 1. Gather Information
Before creating the item, identify:
- **Brand**: (e.g., IKEA, Sterilite). Check `src/items/[brand]/brand.json` for accepted identifiers.
- **Product Line**: (e.g., Alex, Samla). If none, use `general`.
- **Dimensions**: Inner and/or Outer size in millimeters.
  - *Baseline*: `x`, `y`, and `z` are **always required** (even for complex shapes) to define the usable bounding box.
  - *Optional Extensions*:
    - `corner_radius`: For rounded corners on the main box.
    - `polygon`: For custom top-down shapes. Points can be `[x, y]` or `[x, y, radius]`.
    - `levels`: For shapes that change as they get taller (lofts).
  - See `src/items/_examples/advanced-shapes.json` for a hybrid example.
- **Visibility**: 
  - `product`: Main commercial unit.
  - `standalone`: Can be used/sold separately.
  - `component`: Internal part of another item.
- **Identifiers**: Brand-specific (e.g., IKEA uses `mpn` for article numbers).
- **Multi-part Items**: If an item contains other items (like a drawer unit containing drawers):
  - **IDs are derived**: `brand_productline_safename`.
  - **Reference before creation**: You can predict the ID of a part you haven't made yet using this pattern.
  - **Child-First Recommendation**: It is usually easier to create the internal parts (drawers/bins) first to get their confirmed IDs, then create the parent (cabinet/unit).

## 2. Locate Brand Config
Read `src/items/[brand]/brand.json` to see which `identifier_types` are recommended.

## 3. Create the JSON File
Create a new file at `src/items/[brand]/[product-line]/[item-name].json`.
Use the following structure:

```json
{
    "$schema": "../../../schema/item.schema.json",
    "type": "container",
    "name": "Display Name",
    "brand": "brand-id",
    "inner_size": { "x": 100, "y": 100, "z": 100 },
    "outer_size": { "x": 110, "y": 110, "z": 110 },
    "visibility": ["product", "standalone"],
    "sources": [
        { "kind": "manufacturer", "url": "https://..." }
    ],
    "measurements": [
        {
            "by": "your-handle",
            "type": "initial",
            "method": "manual",
            "tool": "caliper",
            "date": "YYYY-MM-DD",
            "notes": "..."
        }
    ],
    "identifiers": {
        "mpn": ["123.456.78"]
    }
}
```

## 4. Validate
After creating the file, run the validation script:
```bash
npm run validate src/items/[brand]/[product-line]/[item-name].json
```
