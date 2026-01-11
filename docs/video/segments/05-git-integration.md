# Segment 5: Git Integration

**Duration:** 10 seconds

---

## First Frame (Screenshot Description)

Split view layout:

**Left Pane (60% width)**: Terminal with vim/nano open
- Code file being edited
- Syntax highlighting visible
- Cursor on a specific line
- File name in status bar

**Right Pane (40% width)**: Git diff viewer
- File header showing filename
- Current diff with colored lines
- Green lines = additions
- Red lines = deletions
- Line numbers visible
- Syntax highlighting matching code language

The split creates a live coding + diff review workflow.

### Key Visual Elements
- Split terminal/diff layout
- Code editor in terminal
- Live diff panel
- Color-coded additions (green background)
- Color-coded deletions (red background)
- File headers
- Line numbers

---

## Video Content (10 seconds)

**0-3 sec**: User types new code in the editor (left pane):
```javascript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```
Characters appear with typing animation.

**3-5 sec**: User saves file (`:w` in vim or Ctrl+S). The git diff panel on the right updates in real-time, showing the new function as green highlighted lines.

**5-7 sec**: User exits editor, runs in terminal:
```
git add .
git commit -m "Add calculateTotal function"
```

**7-9 sec**: Commit success message appears:
```
[feature/totals abc1234] Add calculateTotal function
 1 file changed, 3 insertions(+)
```

**9-10 sec**: Text overlay: "See changes. Commit instantly."

### Motion & Effects
- Typing animation in editor
- Real-time diff update (smooth transition)
- Terminal command execution
- Commit success output
- Text fade-in

---

## Production Checklist

- [ ] Split view with terminal and diff
- [ ] Code file ready for editing
- [ ] Git repository in clean state
- [ ] Real-time diff refresh working
- [ ] Text overlay: "See changes. Commit instantly."
