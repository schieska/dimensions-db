# Contributing to Dimensions DB

We want to make it as easy as possible to add your containers to our database! You don't need to be a professional programmer to contribute.

---

## 🚀 Quick Start Guide

### 1. Get the Tools
You will need a few free programs installed on your computer:
1. **VS Code** (A code editor): [Download here](https://code.visualstudio.com/)
2. **Node.js** (To run our helper tools): [Download "LTS" version](https://nodejs.org/)
3. **Git** (To download the files): [Download here](https://git-scm.com/)

### 2. Download the Project
1. Open your terminal or command prompt.
2. Clone the repository:
   ```bash
   git clone https://github.com/dimensions-db/dimensions-db.git
   cd dimensions-db
   ```
3. Install dependencies (this sets up our tools):
   ```bash
   npm install
   ```
4. Open the folder in VS Code:
   ```bash
   code .
   ```

### 3. Add a New Container
We have built a simple tool that asks you questions to create the file for you. You don't need to write code manually!

1. In VS Code, go to **Terminal > New Terminal** (at the top menu).
2. Type this command and press Enter:
   ```bash
   npm run create
   ```
3. Answer the questions on screen (Brand, Name, Type, Dimensions).
   - If you don't see your brand, you can type a new one!
4. The tool will create a new file for you in `src/items/`.

### 4. Review and Finish
1. Open the file that was just created.
2. Add any extra details if you have them (like `outer_size` or `material`).
3. Save the file.

### 5. Submit your contribution
If you know how to use Git, create a branch and push a Pull Request.
If you are new to Git:
1. Use the "Source Control" tab in VS Code (looks like a branch icon on the left).
2. Type a message like "Added IKEA Samla 5L" in the box.
3. Click **Commit** and then **Sync Changes**.

---

## 📏 Measuring Guide

We want our data to be accurate so pieces fit together nicely!

- **Use a Caliper**: A digital caliper is best, but a ruler works if you are careful.
- **Measure the Inside**: We care most about the *usable* space inside.
- **Rounding**: Round to the nearest whole millimeter (e.g., 295mm, not 295.4mm).
- **Don't Guess**: If you don't have the container, please don't add measurements just from a website description unless you are sure.

---

## 📝 Rules & Style

### Sources
Every item needs a "source" link so we can verify it exists.
- **Good:** Manufacturer website, product manual, or a video review.
- **Bad:** Affiliate links, random guesses.

### Availability
When the tool asks "How is it sold?", choose:
- **Product**: If this is the main thing you buy (e.g., "ALEX Drawer Unit").
- **Standalone**: If it can be used or bought alone (e.g., a "Samla" bin).
- **Component**: If it's a part of something else and rarely sold alone (e.g., a specific drawer inside a cabinet).

---

## ❓ Need Help?

If you get stuck or something doesn't work:
1. Check the [Issues](https://github.com/dimensions-db/dimensions-db/issues) page.
2. Open a new issue and ask your question!
3. Don't worry about breaking things—we review everything before it goes live.

Thanks for helping us make physical storage programmable! 📏
