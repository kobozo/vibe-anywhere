---
active: true
iteration: 1
max_iterations: 25
completion_promise: "COMPLETE"
started_at: "2026-01-10T13:14:21Z"
---

## Task: UI Component Standardization

Standardize all modal components and UI elements to use consistent theming, sizing, and interaction patterns.

### Git Workflow
- **Commit after every iteration** with message format: 'refactor(ui): [component-name] - [change-description]'
- Keep commits atomic and focused on single component/change
- This enables rollback to any iteration if needed via 'git revert' or 'git reset'

### Reference Components
Use these as the canonical implementation patterns:
- **Settings Modal** - Reference for tabbed navigation, layout structure, and sizing
- **Edit Repository Modal** - Reference for form-based modal styling

### Requirements

#### 1. Theme Color Consolidation
- Audit all components for hardcoded color values (hex, rgb, hsl)
- Replace with theme CSS variables/tokens
- Ensure dark/light mode compatibility
- No inline color definitions

#### 2. Modal Sizing Standards
| Modal Type | Height | Width | Use Case |
|------------|--------|-------|----------|
| Message/Alert | 200-300px fixed | 400px | Confirmations, alerts, simple messages |
| Form/Settings | max-height: 75vh | 600-800px | Configuration, editing, multi-field forms |

- All modals: 'overflow-y: auto' on content container
- No dynamic height stretching based on content
- Consistent border-radius, padding, shadow values

#### 3. Multi-Step Flow Pattern
Convert all multi-choice/wizard modals to tabbed approach:
- Horizontal tab navigation (match Settings modal pattern)
- Step indicator showing current position
- Navigation: Previous / Next / Finish buttons
- Form state preservation between steps
- Validation per step before progression

#### 4. Component Checklist
- [ ] All modals use theme color tokens
- [ ] Fixed height with scroll overflow implemented
- [ ] Multi-step flows converted to tabbed wizard
- [ ] Consistent width ratios applied
- [ ] Tab component styling unified
- [ ] Button styles standardized
- [ ] Spacing/padding uses theme tokens

### Deliverables

Upon completion, provide:

1. **Files Modified** - Complete list of changed files with brief description
2. **Component Audit Table**
   | Component | Changes Made | Status |
3. **Theme Tokens** - List of CSS variables/tokens now in use
4. **Modal Specifications** - Final height/width/spacing standards applied
5. **Verification Points** - Which components to manually review
6. **Exceptions** - Any components that could not be standardized and rationale
7. **Git Log** - Summary of commits made during refactor

Output <promise>COMPLETE</promise> when all requirements are implemented and verified.
