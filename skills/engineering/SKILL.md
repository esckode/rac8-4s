# Develop Frontend Page

A guided workflow for developing new frontend pages in this React webapp. Follow this process to ensure pages are properly designed, implemented, and validated.

## Workflow

### 1. Validate Servers
**Goal:** Confirm all required development servers are running

**Steps:**
- Check that the API server is running (typically `localhost:3001` or configured port)
- Check that the frontend dev server is running (typically `localhost:5173` with Vite)
- Check that the database is accessible if needed

**Validation commands:**
```bash
# Check API server
curl http://localhost:3001/health 2>/dev/null || echo "API server not running"

# Check frontend dev server
curl http://localhost:5173 2>/dev/null | head -20 || echo "Frontend server not running"
```

**If servers are down:**
- Start the API: `npm start` in `packages/api/`
- Start the frontend: `npm run dev` in `packages/frontend/`

---

### 2. Launch Webapp in Browser
**Goal:** View the running webapp with persistent browser state

**Steps:**
- Use the provided browser script: `node scripts/browser.js`
- This launches a Chromium browser with persistent state in `.browser-data/`
- The browser will load the webapp homepage

**Manual alternative:**
- Open `http://localhost:5173` in your browser

**Verification:**
- Webapp loads without errors
- You can navigate to the target page route (or the route that will lead to the new page)

---

### 3. Validate Design Exists
**Goal:** Confirm the page design is documented in the design system

**Steps:**
- Check `Authentication_Planning.md` or other design documentation for the target page
- Look for design specs in `/packages/frontend/reference_ui_design/` if it exists
- Review the design tokens and component specifications
- Note any required:
  - Form fields and validation rules
  - Navigation links and button actions
  - Error and loading states
  - Layout and styling specifications

**If design is missing:**
- Ask for design specifications before implementing
- Request clarification on: layout, colors, form fields, validation rules, error states

**If design is incomplete:**
- Note the gaps and confirm approach with the user before implementing

---

### 4. Develop the Page
**Goal:** Implement the page to match the design exactly unless design issues conflict with requirements

**Viewport Considerations:**

Before implementing, determine the page's viewport requirements:

**Mobile Pages (390×844px):**
- Authentication pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Mobile-first design pattern
- Root container must have explicit dimensions: `width: 390, height: 844`
- Add `margin: '0 auto'` to center in viewport
- Add `position: 'relative', overflow: 'hidden'` for content containment
- Example from Login page:
  ```javascript
  style={{
    width: 390,
    height: 844,
    background: 'linear-gradient(...)',
    margin: '0 auto',
    overflow: 'hidden',
    position: 'relative',
  }}
  ```

**Desktop Pages (full-width):**
- Responsive layout pages: `/browse`, `/matches`, `/tournament/:id`, etc.
- Use `minHeight: '100vh'` or similar responsive constraints
- No fixed width — adapts to container size
- Use flex/grid layouts for responsive behavior

**Implementation checklist:**
- [ ] Determine if page is mobile (390×844px) or responsive/desktop
- [ ] Create the React component file in `/packages/frontend/src/pages/`
- [ ] Set up viewport constraints based on page type
- [ ] Import required dependencies (hooks, routing, components)
- [ ] Implement the page layout and styling to match design
- [ ] Add form fields with appropriate validation
- [ ] Implement navigation links and button actions
- [ ] Add loading states (spinners, disabled form fields)
- [ ] Add error states and error messages
- [ ] Test form validation behavior
- [ ] Test navigation flow
- [ ] Verify viewport renders correctly (mobile 390px or responsive design)

**Key principles:**
- Match the design exactly unless there are UX or technical issues
- Use TypeScript for type safety
- Follow existing code patterns and naming conventions
- Use inline styles or CSS-in-JS to match design tokens
- Test in the browser before marking complete

---

### 5. Validate in Browser
**Goal:** Confirm the page matches the design and functions correctly

**Viewport Validation (First Check):**
- [ ] Mobile pages (auth pages): Verify the page displays at 390×844px dimensions
  - Page should be centered if browser window is larger
  - No horizontal scrolling on mobile viewport
  - All content fits within 390px width
- [ ] Responsive pages: Verify page adapts to different screen sizes
  - Works on mobile (390px)
  - Works on tablet (768px)
  - Works on desktop (1024px+)

**Visual & Design Validation:**
- Navigate to the new page in the running browser
- Compare side-by-side with design specification
- Check:
  - Spacing and padding matches design
  - Colors are correct (gradients, buttons, text)
  - Typography is correct (font sizes, weights)
  - All visual elements present (icons, borders, effects)

**Form Testing:**
- Fill in fields
- Test validation (invalid inputs, required fields)
- Test button states (disabled/enabled)
- Test form submission
- Verify all error messages display correctly

**Navigation Testing:**
- Click all links and buttons
- Confirm navigation routes work correctly
- Test back navigation
- Verify links navigate to correct pages

**Error State Testing:**
- Verify error messages display correctly
- Check error styling matches design
- Test all error scenarios (validation, server errors, etc.)

**Loading State Testing:**
- Verify spinner displays during submission
- Check form fields disable during loading
- Check button text changes if specified

**Issues to watch for:**
- Viewport not matching design (mobile pages should be 390px)
- Typos or text mismatches
- Colors or spacing that don't match design
- Missing form fields or validation
- Broken navigation links
- Missing error/loading states
- Horizontal scrolling on mobile pages

---

### 6. Code Review & Cleanup
**Goal:** Ensure code quality before merging

**Checklist:**
- [ ] No TypeScript errors
- [ ] No console warnings or errors
- [ ] Code follows project conventions
- [ ] No unnecessary imports or dead code
- [ ] Comments added only where logic is non-obvious
- [ ] Form validation works as specified
- [ ] All navigation links work
- [ ] Responsive on mobile

---

## Tips

**Viewport Setup (Critical):**
- Mobile auth pages: Add `width: 390, height: 844, margin: '0 auto', overflow: 'hidden'` to root container
- Check existing pages for viewport pattern before implementing
- Incorrect viewport will cause design mismatches and make validation fail
- If page doesn't match design during browser validation, check viewport first

**Design Matching:**
- Keep the design specification visible while coding
- Use the browser's DevTools to inspect elements and compare spacing/colors
- Reference existing pages in the codebase for styling patterns
- Compare your page side-by-side with the design during development

**Testing:**
- Use the persistent browser state to test multiple flows
- Take screenshots of working states for documentation
- Test on actual mobile sizes (390px reference) or use DevTools device emulation
- Verify viewport dimensions match the design before other validations

**Getting Stuck:**
- Check the viewport setup first if page looks wrong
- Review similar existing pages for viewport and styling patterns
- Check if components are missing from the component library
- Ask for clarification on design or requirements before implementing

**Making Changes:**
- Match the design exactly unless:
  - Design conflicts with functional requirements
  - Design would create accessibility issues
  - Design requests are unclear
  - If any of these occur, flag them and confirm approach

---

## Related Docs

- `Authentication_Planning.md` — Design specs for authentication pages
- `/packages/frontend/reference_ui_design/` — Design references and specifications
- `/packages/frontend/src/pages/` — Existing page implementations to reference
- `CLAUDE.md` — Coding principles and project guidelines
