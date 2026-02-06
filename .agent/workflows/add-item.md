---
description: How to add a new container to the database
---

# /add-item

To add a new item to the database, follow these steps:

1.  **Configure your identity** (if not already done):
    - Check if `.contributor-config.json` exists. If not, the tool will ask for your handle.
    
// turbo
2.  **Run the Interactive Creator**:
    ```powershell
    npm run create
    ```
    - Select or create the **Brand**.
    - Select or create the **Product Line**.
    - Use **Product** visibility for main units and **Standalone** for items that can be used alone.
    - Provide **Inner** or **Outer** dimensions (at least one is required).
    - Provide **Identifiers** (like EAN or IKEA Part Numbers) if you have them.

3.  **Validate your entry**:
    - The tool will tell you where the file was created.
    - Run validation to ensure everything is perfect:
    ```powershell
    npm run validate
    ```

4.  **Submit**:
    - Build the project to verify the distribution files:
    ```powershell
    npm run build
    ```
    - Commit and push your changes.
